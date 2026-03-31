import * as Y from "yjs";
import type { RoomProvider, ConnectionStatus } from "./mqtt-provider";

export type { ConnectionStatus };

export type Phase = "voting" | "revealed";

export interface Participant {
  id: string;
  name: string;
}

export interface RoomSnapshot {
  participants: Participant[];
  votes: Record<string, string>;
  inactive: Set<string>;
  phase: Phase;
  issue: string;
  myId: string;
}

export type RoomListener = (snapshot: RoomSnapshot) => void;

const HEARTBEAT_INTERVAL = 10_000;
const INACTIVE_THRESHOLD = 2 * 60_000; // 2 minutes

export class Room {
  readonly myId: string;
  private doc: Y.Doc;
  private provider: RoomProvider;
  private votes: Y.Map<string>;
  private participants: Y.Map<{ name: string; lastSeen: number }>;
  private meta: Y.Map<string>;
  private listeners = new Set<RoomListener>();
  private beforeUnloadHandler: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;
  private name: string;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private inactiveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private inactivePeers = new Set<string>();
  private destroyed = false;
  private statusListeners = new Set<(status: ConnectionStatus) => void>();

  constructor(myId: string, name: string, provider: RoomProvider, doc?: Y.Doc) {
    this.myId = myId;
    this.name = name;
    this.doc = doc ?? new Y.Doc();
    this.provider = provider;

    this.votes = this.doc.getMap<string>("votes");
    this.participants = this.doc.getMap<{ name: string; lastSeen: number }>("participants");
    this.meta = this.doc.getMap<string>("meta");

    this.participants.set(this.myId, { name, lastSeen: Date.now() });

    if (!this.meta.has("phase")) {
      this.meta.set("phase", "voting");
    }
    if (!this.meta.has("issue")) {
      this.meta.set("issue", "");
    }

    const notify = () => this.notifyListeners();
    this.votes.observe(notify);
    this.participants.observe(() => {
      if (!this.destroyed && !this.participants.has(this.myId)) {
        this.participants.set(this.myId, { name: this.name, lastSeen: Date.now() });
        return;
      }
      this.participants.forEach((value, peerId) => {
        if (peerId !== this.myId) this.scheduleInactiveCheck(peerId, value.lastSeen);
      });
      notify();
    });
    this.meta.observe(notify);

    this.provider.onPeerLeave = (peerId: string) => {
      if (peerId !== this.myId) this.removePeer(peerId);
    };

    this.provider.onStatus = (status: ConnectionStatus) => {
      for (const listener of this.statusListeners) listener(status);
    };

    this.heartbeatTimer = setInterval(() => {
      this.participants.set(this.myId, { name: this.name, lastSeen: Date.now() });
    }, HEARTBEAT_INTERVAL);

    if (typeof window !== "undefined") {
      this.beforeUnloadHandler = () => this.provider.publishLeave();
      window.addEventListener("beforeunload", this.beforeUnloadHandler);

      this.visibilityHandler = () => {
        if (document.visibilityState === "visible") {
          this.participants.set(this.myId, { name: this.name, lastSeen: Date.now() });
        }
      };
      document.addEventListener("visibilitychange", this.visibilityHandler);
    }
  }

  getSnapshot(): RoomSnapshot {
    const participants: Participant[] = [];
    this.participants.forEach((value, key) => {
      participants.push({ id: key, name: value.name });
    });

    const votes: Record<string, string> = {};
    this.votes.forEach((value: string, key: string) => {
      votes[key] = value;
    });

    return {
      participants,
      votes,
      inactive: new Set(this.inactivePeers),
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
      this.votes.forEach((_: string, key: string) => {
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

  subscribeStatus(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  kick(peerId: string): void {
    if (peerId === this.myId) return;
    this.removePeer(peerId);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const timer of this.inactiveTimers.values()) clearTimeout(timer);
    this.inactiveTimers.clear();
    if (typeof window !== "undefined") {
      if (this.beforeUnloadHandler) {
        window.removeEventListener("beforeunload", this.beforeUnloadHandler);
      }
      if (this.visibilityHandler) {
        document.removeEventListener("visibilitychange", this.visibilityHandler);
      }
    }
    this.provider.publishLeave();
    this.participants.delete(this.myId);
    this.provider.destroy();
    this.doc.destroy();
    this.listeners.clear();
    this.statusListeners.clear();
  }

  private removePeer(peerId: string): void {
    const timer = this.inactiveTimers.get(peerId);
    if (timer) clearTimeout(timer);
    this.inactiveTimers.delete(peerId);
    this.inactivePeers.delete(peerId);
    this.doc.transact(() => {
      if (this.participants.has(peerId)) this.participants.delete(peerId);
      if (this.votes.has(peerId)) this.votes.delete(peerId);
    });
  }

  private scheduleInactiveCheck(peerId: string, lastSeen: number): void {
    const existing = this.inactiveTimers.get(peerId);
    if (existing) clearTimeout(existing);

    const remaining = INACTIVE_THRESHOLD - (Date.now() - lastSeen);
    if (remaining <= 0) {
      this.inactivePeers.add(peerId);
      return;
    }

    this.inactivePeers.delete(peerId);
    this.inactiveTimers.set(
      peerId,
      setTimeout(() => {
        this.inactiveTimers.delete(peerId);
        this.inactivePeers.add(peerId);
        this.notifyListeners();
      }, remaining),
    );
  }

  private notifyListeners(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
