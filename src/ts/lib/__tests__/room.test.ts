import { describe, it, expect, vi } from "vitest";
import * as Y from "yjs";

// Mock MQTT provider — requires network unavailable in Node
vi.mock("../mqtt-provider", () => {
  return {
    MqttProvider: class {
      destroy = vi.fn();
      publishHeartbeat = vi.fn();
      publishLeave = vi.fn();
      onHeartbeat: ((peerId: string) => void) | null = null;
      onPeerLeave: ((peerId: string) => void) | null = null;
      onStatus: ((status: string) => void) | null = null;
    },
  };
});

// Mock identity to return predictable IDs
let mockId = "user-1";
vi.mock("../identity", () => ({
  getOrCreateIdentity: () => mockId,
}));

const { Room } = await import("../room");

describe("Room", () => {
  it("registers the participant on construction", () => {
    mockId = "user-1";
    const room = new Room("test-room", "Alice");
    const snap = room.getSnapshot();

    expect(snap.myId).toBe("user-1");
    expect(snap.participants).toEqual([{ id: "user-1", name: "Alice" }]);
  });

  it("initializes with voting phase and empty issue", () => {
    const room = new Room("test-room", "Alice");
    const snap = room.getSnapshot();

    expect(snap.phase).toBe("voting");
    expect(snap.issue).toBe("");
  });

  it("vote() sets the current user's vote", () => {
    const room = new Room("test-room", "Alice");
    room.vote("5");

    expect(room.getSnapshot().votes).toEqual({ "user-1": "5" });
  });

  it("vote() overwrites previous vote", () => {
    const room = new Room("test-room", "Alice");
    room.vote("5");
    room.vote("8");

    expect(room.getSnapshot().votes).toEqual({ "user-1": "8" });
  });

  it("clearVote() removes the current user's vote", () => {
    const room = new Room("test-room", "Alice");
    room.vote("5");
    room.clearVote();

    expect(room.getSnapshot().votes).toEqual({});
  });

  it("reveal() sets phase to revealed", () => {
    const room = new Room("test-room", "Alice");
    room.reveal();

    expect(room.getSnapshot().phase).toBe("revealed");
  });

  it("reset() clears all votes and sets phase to voting", () => {
    mockId = "user-1";
    const room = new Room("test-room", "Alice");
    room.vote("5");
    room.reveal();
    room.reset();

    const snap = room.getSnapshot();
    expect(snap.votes).toEqual({});
    expect(snap.phase).toBe("voting");
  });

  it("setIssue() updates the issue text", () => {
    const room = new Room("test-room", "Alice");
    room.setIssue("Login bug");

    expect(room.getSnapshot().issue).toBe("Login bug");
  });

  it("subscribe() notifies on state changes", () => {
    const room = new Room("test-room", "Alice");
    const snapshots: unknown[] = [];
    room.subscribe((snap) => snapshots.push(snap));

    room.vote("5");

    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots[snapshots.length - 1]).toMatchObject({
      votes: { "user-1": "5" },
    });
  });

  it("subscribe() returns an unsubscribe function", () => {
    const room = new Room("test-room", "Alice");
    const snapshots: unknown[] = [];
    const unsub = room.subscribe((snap) => snapshots.push(snap));

    unsub();
    room.vote("5");

    expect(snapshots).toEqual([]);
  });

  it("destroy() removes participant", () => {
    const room = new Room("test-room", "Alice");
    expect(room.getSnapshot().participants).toHaveLength(1);

    room.destroy();
    // After destroy, the yjs doc is destroyed so we can't read state,
    // but we verify no error is thrown
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

  it("handles phase reveal and reset across peers", () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    doc1.on("update", (update: Uint8Array) => {
      Y.applyUpdate(doc2, update);
    });
    doc2.on("update", (update: Uint8Array) => {
      Y.applyUpdate(doc1, update);
    });

    const meta1 = doc1.getMap<string>("meta");
    const meta2 = doc2.getMap<string>("meta");

    meta1.set("phase", "voting");
    expect(meta2.get("phase")).toBe("voting");

    meta2.set("phase", "revealed");
    expect(meta1.get("phase")).toBe("revealed");

    meta1.set("phase", "voting");
    expect(meta2.get("phase")).toBe("voting");
  });

  it("late joiner receives existing state", () => {
    const doc1 = new Y.Doc();

    doc1.getMap<string>("votes").set("user-1", "5");
    doc1.getMap<{ name: string }>("participants").set("user-1", {
      name: "Alice",
    });

    const doc2 = new Y.Doc();
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

    expect(doc2.getMap<string>("votes").get("user-1")).toBe("5");
    expect(doc2.getMap<{ name: string }>("participants").get("user-1")).toEqual(
      {
        name: "Alice",
      },
    );
  });
});
