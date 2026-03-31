import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as Y from "yjs";
import { Room } from "../room";
import type { RoomProvider, ConnectionStatus } from "../mqtt-provider";

function createStubProvider() {
  return {
    onPeerLeave: null as RoomProvider["onPeerLeave"],
    onStatus: null as RoomProvider["onStatus"],
    publishLeave: vi.fn<() => void>(),
    destroy: vi.fn<() => void>(),
  } satisfies RoomProvider;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Room", () => {
  it("registers the participant on construction", () => {
    const room = new Room("user-1", "Alice", createStubProvider());
    const snap = room.getSnapshot();

    expect(snap.myId).toBe("user-1");
    expect(snap.participants).toEqual([{ id: "user-1", name: "Alice" }]);
  });

  it("initializes with voting phase and empty issue", () => {
    const room = new Room("user-1", "Alice", createStubProvider());
    const snap = room.getSnapshot();

    expect(snap.phase).toBe("voting");
    expect(snap.issue).toBe("");
  });

  it("vote() sets the current user's vote", () => {
    const room = new Room("user-1", "Alice", createStubProvider());
    room.vote("5");

    expect(room.getSnapshot().votes).toEqual({ "user-1": "5" });
  });

  it("vote() overwrites previous vote", () => {
    const room = new Room("user-1", "Alice", createStubProvider());
    room.vote("5");
    room.vote("8");

    expect(room.getSnapshot().votes).toEqual({ "user-1": "8" });
  });

  it("clearVote() removes the current user's vote", () => {
    const room = new Room("user-1", "Alice", createStubProvider());
    room.vote("5");
    room.clearVote();

    expect(room.getSnapshot().votes).toEqual({});
  });

  it("reveal() sets phase to revealed", () => {
    const room = new Room("user-1", "Alice", createStubProvider());
    room.reveal();

    expect(room.getSnapshot().phase).toBe("revealed");
  });

  it("reset() clears all votes and sets phase to voting", () => {
    const room = new Room("user-1", "Alice", createStubProvider());
    room.vote("5");
    room.reveal();
    room.reset();

    const snap = room.getSnapshot();
    expect(snap.votes).toEqual({});
    expect(snap.phase).toBe("voting");
  });

  it("setIssue() updates the issue text", () => {
    const room = new Room("user-1", "Alice", createStubProvider());
    room.setIssue("Login bug");

    expect(room.getSnapshot().issue).toBe("Login bug");
  });

  it("subscribe() notifies on state changes", () => {
    const room = new Room("user-1", "Alice", createStubProvider());
    const snapshots: unknown[] = [];
    room.subscribe((snap) => snapshots.push(snap));

    room.vote("5");

    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots[snapshots.length - 1]).toMatchObject({
      votes: { "user-1": "5" },
    });
  });

  it("subscribe() returns an unsubscribe function", () => {
    const room = new Room("user-1", "Alice", createStubProvider());
    const snapshots: unknown[] = [];
    const unsub = room.subscribe((snap) => snapshots.push(snap));

    unsub();
    room.vote("5");

    expect(snapshots).toEqual([]);
  });

  it("destroy() calls publishLeave and cleans up provider", () => {
    const provider = createStubProvider();
    const room = new Room("user-1", "Alice", provider);

    room.destroy();

    expect(provider.publishLeave).toHaveBeenCalled();
    expect(provider.destroy).toHaveBeenCalled();
  });
});

describe("peer leave", () => {
  it("removes peer and their vote on leave", () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();
    doc1.on("update", (u: Uint8Array) => Y.applyUpdate(doc2, u));
    doc2.on("update", (u: Uint8Array) => Y.applyUpdate(doc1, u));

    const room = new Room("user-1", "Alice", createStubProvider(), doc1);
    new Room("peer-2", "Bob", createStubProvider(), doc2);
    expect(room.getSnapshot().participants).toHaveLength(2);

    const provider = createStubProvider();
    const room1 = new Room("user-1", "Alice", provider);

    // Simulate peer joining via shared doc
    const doc = (room1 as unknown as { doc: Y.Doc }).doc;
    doc.getMap<{ name: string; lastSeen: number }>("participants").set("peer-2", { name: "Bob", lastSeen: Date.now() });
    doc.getMap<string>("votes").set("peer-2", "5");

    provider.onPeerLeave!("peer-2");
    expect(
      room1.getSnapshot().participants.find((p) => p.id === "peer-2"),
    ).toBeUndefined();
    expect(room1.getSnapshot().votes["peer-2"]).toBeUndefined();
  });

  it("does not remove self on own leave message", () => {
    const provider = createStubProvider();
    const room = new Room("user-1", "Alice", provider);

    provider.onPeerLeave!("user-1");
    expect(room.getSnapshot().participants).toEqual([
      { id: "user-1", name: "Alice" },
    ]);
  });
});

describe("inactivity and kick", () => {
  it("marks peer as inactive after threshold", () => {
    const room = new Room("user-1", "Alice", createStubProvider());

    const doc = (room as unknown as { doc: Y.Doc }).doc;
    doc.getMap<{ name: string; lastSeen: number }>("participants").set("peer-2", { name: "Bob", lastSeen: Date.now() });

    expect(room.getSnapshot().inactive.has("peer-2")).toBe(false);

    vi.advanceTimersByTime(2 * 60_000);

    expect(room.getSnapshot().inactive.has("peer-2")).toBe(true);
  });

  it("clears inactive when peer heartbeat arrives", () => {
    const room = new Room("user-1", "Alice", createStubProvider());

    const doc = (room as unknown as { doc: Y.Doc }).doc;
    const participants = doc.getMap<{ name: string; lastSeen: number }>("participants");
    participants.set("peer-2", { name: "Bob", lastSeen: Date.now() });

    vi.advanceTimersByTime(2 * 60_000);
    expect(room.getSnapshot().inactive.has("peer-2")).toBe(true);

    participants.set("peer-2", { name: "Bob", lastSeen: Date.now() });
    expect(room.getSnapshot().inactive.has("peer-2")).toBe(false);
  });

  it("kick() removes a peer and their vote", () => {
    const provider = createStubProvider();
    const room = new Room("user-1", "Alice", provider);

    const doc = (room as unknown as { doc: Y.Doc }).doc;
    doc.getMap<{ name: string; lastSeen: number }>("participants").set("peer-2", { name: "Bob", lastSeen: Date.now() - 300_000 });
    doc.getMap<string>("votes").set("peer-2", "5");

    room.kick("peer-2");

    const snap = room.getSnapshot();
    expect(snap.participants.find((p) => p.id === "peer-2")).toBeUndefined();
    expect(snap.votes["peer-2"]).toBeUndefined();
    expect(snap.inactive.has("peer-2")).toBe(false);
  });

  it("kick() does not remove self", () => {
    const room = new Room("user-1", "Alice", createStubProvider());
    room.kick("user-1");

    expect(room.getSnapshot().participants).toHaveLength(1);
  });

  it("connected peer re-adds itself after being kicked", () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();
    doc1.on("update", (u: Uint8Array) => Y.applyUpdate(doc2, u));
    doc2.on("update", (u: Uint8Array) => Y.applyUpdate(doc1, u));

    const room1 = new Room("user-1", "Alice", createStubProvider(), doc1);
    new Room("peer-2", "Bob", createStubProvider(), doc2);

    expect(room1.getSnapshot().participants).toHaveLength(2);

    room1.kick("peer-2");

    // peer-2's Room is still alive, so it re-adds itself
    expect(
      room1.getSnapshot().participants.find((p) => p.id === "peer-2"),
    ).toEqual({ id: "peer-2", name: "Bob" });
  });

  it("disconnected peer stays removed after being kicked", () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();
    doc1.on("update", (u: Uint8Array) => Y.applyUpdate(doc2, u));
    doc2.on("update", (u: Uint8Array) => Y.applyUpdate(doc1, u));

    const room1 = new Room("user-1", "Alice", createStubProvider(), doc1);
    const room2 = new Room("peer-2", "Bob", createStubProvider(), doc2);

    expect(room1.getSnapshot().participants).toHaveLength(2);

    // peer-2 disconnects (destroys their room)
    room2.destroy();

    room1.kick("peer-2");

    // peer-2 is gone, nobody re-adds
    expect(
      room1.getSnapshot().participants.find((p) => p.id === "peer-2"),
    ).toBeUndefined();
  });

  it("forwards status to subscribeStatus listeners", () => {
    const provider = createStubProvider();
    const room = new Room("user-1", "Alice", provider);

    const statuses: ConnectionStatus[] = [];
    room.subscribeStatus((s) => statuses.push(s));

    provider.onStatus!({ type: "connected" });
    provider.onStatus!({ type: "disconnected" });
    provider.onStatus!({ type: "error", message: "timeout" });

    expect(statuses).toEqual([
      { type: "connected" },
      { type: "disconnected" },
      { type: "error", message: "timeout" },
    ]);
  });
});

describe("yjs state sync", () => {
  it("syncs votes between two docs", () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    doc1.on("update", (update: Uint8Array) => {
      Y.applyUpdate(doc2, update);
    });
    doc2.on("update", (update: Uint8Array) => {
      Y.applyUpdate(doc1, update);
    });

    const votes1 = doc1.getMap<string>("votes");
    const votes2 = doc2.getMap<string>("votes");

    votes1.set("user-1", "5");
    expect(votes2.get("user-1")).toBe("5");

    votes2.set("user-2", "8");
    expect(votes1.get("user-2")).toBe("8");
  });

  it("syncs participants between two docs", () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    doc1.on("update", (update: Uint8Array) => {
      Y.applyUpdate(doc2, update);
    });
    doc2.on("update", (update: Uint8Array) => {
      Y.applyUpdate(doc1, update);
    });

    const participants1 = doc1.getMap<{ name: string }>("participants");
    const participants2 = doc2.getMap<{ name: string }>("participants");

    participants1.set("user-1", { name: "Alice" });
    participants2.set("user-2", { name: "Bob" });

    expect(participants1.get("user-2")).toEqual({ name: "Bob" });
    expect(participants2.get("user-1")).toEqual({ name: "Alice" });
  });

  it("two rooms sharing a synced doc see each other", () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    doc1.on("update", (update: Uint8Array) => {
      Y.applyUpdate(doc2, update);
    });
    doc2.on("update", (update: Uint8Array) => {
      Y.applyUpdate(doc1, update);
    });

    const room1 = new Room("user-1", "Alice", createStubProvider(), doc1);
    const room2 = new Room("user-2", "Bob", createStubProvider(), doc2);

    expect(room1.getSnapshot().participants).toHaveLength(2);
    expect(room2.getSnapshot().participants).toHaveLength(2);

    room1.vote("5");
    expect(room2.getSnapshot().votes["user-1"]).toBe("5");

    room2.vote("8");
    expect(room1.getSnapshot().votes["user-2"]).toBe("8");
  });
});
