import * as Y from "yjs";
import { MqttProvider } from "./mqtt-provider";
import { getOrCreateIdentity } from "./identity";

export type Phase = "voting" | "revealed";

export interface Participant {
  id: string;
  name: string;
}

export interface RoomSnapshot {
  participants: Participant[];
  votes: Record<string, string>;
  phase: Phase;
  issue: string;
  myId: string;
}

export type RoomListener = (snapshot: RoomSnapshot) => void;

const HEARTBEAT_INTERVAL = 5_000;
const PRESENCE_TIMEOUT = 15_000;
const GRACE_PERIOD = 20_000;

export class Room {
  readonly myId: string;
  private doc: Y.Doc;
  private provider: MqttProvider;
  private votes: Y.Map<string>;
  private participants: Y.Map<{ name: string }>;
  private meta: Y.Map<string>;
  private listeners = new Set<RoomListener>();
  private lastSeen = new Map<string, number>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private joinedAt: number;
  private beforeUnloadHandler: (() => void) | null = null;
  onStatus: ((status: string) => void) | null = null;

  constructor(roomId: string, name: string) {
    this.myId = getOrCreateIdentity();
    this.joinedAt = Date.now();
    this.doc = new Y.Doc();

    this.provider = new MqttProvider(this.doc, roomId, this.myId);

    this.votes = this.doc.getMap<string>("votes");
    this.participants = this.doc.getMap<{ name: string }>("participants");
    this.meta = this.doc.getMap<string>("meta");

    this.participants.set(this.myId, { name });

    if (!this.meta.has("phase")) {
      this.meta.set("phase", "voting");
    }
    if (!this.meta.has("issue")) {
      this.meta.set("issue", "");
    }

    const notify = () => this.notifyListeners();
    this.votes.observe(notify);
    this.participants.observe(notify);
    this.meta.observe(notify);

    // Presence tracking
    this.lastSeen.set(this.myId, Date.now());

    this.provider.onHeartbeat = (peerId: string) => {
      this.lastSeen.set(peerId, Date.now());
    };

    this.provider.onPeerLeave = (peerId: string) => {
      if (peerId !== this.myId) this.removePeer(peerId);
    };

    this.provider.onStatus = (status: string) => {
      this.onStatus?.(status);
    };

    this.heartbeatTimer = setInterval(() => {
      this.provider.publishHeartbeat();
      this.lastSeen.set(this.myId, Date.now());
    }, HEARTBEAT_INTERVAL);

    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleParticipants();
    }, HEARTBEAT_INTERVAL);

    if (typeof window !== "undefined") {
      this.beforeUnloadHandler = () => this.provider.publishLeave();
      window.addEventListener("beforeunload", this.beforeUnloadHandler);
    }
  }

  getSnapshot(): RoomSnapshot {
    const participants: Participant[] = [];
    this.participants.forEach((value, key) => {
      participants.push({ id: key, name: value.name });
    });

    const votes: Record<string, string> = {};
    this.votes.forEach((value, key) => {
      votes[key] = value;
    });

    return {
      participants,
      votes,
      phase: (this.meta.get("phase") as Phase) ?? "voting",
      issue: this.meta.get("issue") ?? "",
      myId: this.myId,
    };
  }

  vote(value: string): void {
    this.votes.set(this.myId, value);
  }

  clearVote(): void {
    this.votes.delete(this.myId);
  }

  reveal(): void {
    this.meta.set("phase", "revealed");
  }

  reset(): void {
    this.doc.transact(() => {
      this.votes.forEach((_, key) => {
        this.votes.delete(key);
      });
      this.meta.set("phase", "voting");
    });
  }

  setIssue(text: string): void {
    this.meta.set("issue", text);
  }

  subscribe(listener: RoomListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    if (this.beforeUnloadHandler && typeof window !== "undefined") {
      window.removeEventListener("beforeunload", this.beforeUnloadHandler);
    }
    this.provider.publishLeave();
    this.participants.delete(this.myId);
    this.provider.destroy();
    this.doc.destroy();
    this.listeners.clear();
  }

  private removePeer(peerId: string): void {
    this.lastSeen.delete(peerId);
    this.doc.transact(() => {
      if (this.participants.has(peerId)) this.participants.delete(peerId);
      if (this.votes.has(peerId)) this.votes.delete(peerId);
    });
  }

  private cleanupStaleParticipants(): void {
    const now = Date.now();
    if (now - this.joinedAt < GRACE_PERIOD) return;

    this.participants.forEach((_value: { name: string }, peerId: string) => {
      if (peerId === this.myId) return;
      const lastSeen = this.lastSeen.get(peerId);
      if (!lastSeen || now - lastSeen > PRESENCE_TIMEOUT) {
        this.removePeer(peerId);
      }
    });
  }

  private notifyListeners(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
