import { Room, RoomSnapshot } from "./room";

const log = (prefix: string, msg: string, ...args: unknown[]) =>
  console.log(`[${prefix}] ${msg}`, ...args);

export function attachRoomLogger(room: Room): () => void {
  let prev = room.getSnapshot();
  const id = room.myId.slice(0, 8);

  log("room", "joined as %s — %d participant(s)", id, prev.participants.length);

  room.onStatus = (status: string) => {
    log("mqtt", status);
  };

  const unsub = room.subscribe((snap: RoomSnapshot) => {
    const prevIds = new Map(prev.participants.map((p) => [p.id, p.name]));
    const currIds = new Map(snap.participants.map((p) => [p.id, p.name]));

    for (const [pid, name] of currIds) {
      if (!prevIds.has(pid)) {
        log("room", "+ %s (%s)", name, pid.slice(0, 8));
      }
    }
    for (const [pid, name] of prevIds) {
      if (!currIds.has(pid)) {
        log("room", "- %s (%s)", name, pid.slice(0, 8));
      }
    }

    for (const pid of Object.keys(snap.votes)) {
      if (snap.votes[pid] !== prev.votes[pid]) {
        const name = currIds.get(pid) ?? pid.slice(0, 8);
        log("room", "vote: %s → %s", name, snap.votes[pid]);
      }
    }
    for (const pid of Object.keys(prev.votes)) {
      if (!(pid in snap.votes)) {
        const name = prevIds.get(pid) ?? pid.slice(0, 8);
        log("room", "vote cleared: %s", name);
      }
    }

    if (snap.phase !== prev.phase) {
      log("room", "phase: %s → %s", prev.phase, snap.phase);
    }

    if (snap.issue !== prev.issue) {
      log("room", 'issue: "%s"', snap.issue || "");
    }

    prev = snap;
  });

  return () => {
    room.onStatus = null;
    unsub();
  };
}
