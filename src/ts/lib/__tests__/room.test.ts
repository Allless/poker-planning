import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as Y from "yjs";
import { Room } from "../room";
import type { RoomProvider, ConnectionStatus } from "../mqtt-provider";

function createStubProvider() {
  return {
    onPeerLeave: null as RoomProvider["onPeerLeave"],
    onPing: null as RoomProvider["onPing"],
    onPong: null as RoomProvider["onPong"],
    onStatus: null as RoomProvider["onStatus"],
    publishPing: vi.fn<() => void>(),
    publishPong: vi.fn<(name: string) => void>(),
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
    const provider = createStubProvider();
    const room = new Room("user-1", "Alice", provider);

    // Add peer via pong
    provider.onPong!("peer-2", "Bob");
    expect(room.getSnapshot().participants).toHaveLength(2);

    provider.onPeerLeave!("peer-2");
    expect(
      room.getSnapshot().participants.find((p) => p.id === "peer-2"),
    ).toBeUndefined();
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

describe("roll call", () => {
  it("sends ping on connect", () => {
    const provider = createStubProvider();
    new Room("user-1", "Alice", provider);

    provider.onStatus!({ type: "connected" });

    expect(provider.publishPing).toHaveBeenCalled();
  });

  it("responds with pong including name when pinged", () => {
    const provider = createStubProvider();
    new Room("user-1", "Alice", provider);

    provider.onPing!("peer-2");

    expect(provider.publishPong).toHaveBeenCalledWith("Alice");
  });

  it("removes ghost participants after roll call timeout", () => {
    const provider = createStubProvider();
    const room = new Room("user-1", "Alice", provider);

    // Add a peer
    provider.onPong!("peer-2", "Bob");
    expect(room.getSnapshot().participants).toHaveLength(2);

    // Trigger roll call — peer-2 does NOT respond
    provider.onStatus!({ type: "connected" });
    vi.advanceTimersByTime(5_000);

    expect(room.getSnapshot().participants).toEqual([
      { id: "user-1", name: "Alice" },
    ]);
  });

  it("keeps participants who respond to roll call", () => {
    const provider = createStubProvider();
    const room = new Room("user-1", "Alice", provider);

    provider.onPong!("peer-2", "Bob");
    expect(room.getSnapshot().participants).toHaveLength(2);

    // Trigger roll call — peer-2 responds
    provider.onStatus!({ type: "connected" });
    provider.onPong!("peer-2", "Bob");
    vi.advanceTimersByTime(5_000);

    expect(room.getSnapshot().participants).toHaveLength(2);
    expect(
      room.getSnapshot().participants.find((p) => p.id === "peer-2"),
    ).toEqual({ id: "peer-2", name: "Bob" });
  });

  it("adds unknown peer who responds with pong", () => {
    const provider = createStubProvider();
    const room = new Room("user-1", "Alice", provider);

    expect(room.getSnapshot().participants).toHaveLength(1);

    provider.onPong!("peer-3", "Charlie");

    expect(room.getSnapshot().participants).toHaveLength(2);
    expect(
      room.getSnapshot().participants.find((p) => p.id === "peer-3"),
    ).toEqual({ id: "peer-3", name: "Charlie" });
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
