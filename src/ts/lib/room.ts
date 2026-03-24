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
  phase: Phase;
  issue: string;
  myId: string;
}

export type RoomListener = (snapshot: RoomSnapshot) => void;

const ROLL_CALL_TIMEOUT = 5_000;

export class Room {
  readonly myId: string;
  private doc: Y.Doc;
  private provider: RoomProvider;
  private votes: Y.Map<string>;
  private participants: Y.Map<{ name: string }>;
  private meta: Y.Map<string>;
  private listeners = new Set<RoomListener>();
  private beforeUnloadHandler: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;
  private name: string;
  private rollCallTimer: ReturnType<typeof setTimeout> | null = null;
  private rollCallResponders = new Set<string>();
  private statusListeners = new Set<(status: ConnectionStatus) => void>();

  constructor(myId: string, name: string, provider: RoomProvider, doc?: Y.Doc) {
    this.myId = myId;
    this.name = name;
    this.doc = doc ?? new Y.Doc();
    this.provider = provider;

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

    this.provider.onPeerLeave = (peerId: string) => {
      if (peerId !== this.myId) this.removePeer(peerId);
    };

    this.provider.onPing = (_peerId: string) => {
      this.provider.publishPong(this.name);
    };

    this.provider.onPong = (peerId: string, peerName: string) => {
      this.rollCallResponders.add(peerId);
      if (!this.participants.has(peerId)) {
        this.participants.set(peerId, { name: peerName });
      }
    };

    this.provider.onStatus = (status: ConnectionStatus) => {
      if (status.type === "connected") this.startRollCall();
      for (const listener of this.statusListeners) listener(status);
    };

    if (typeof window !== "undefined") {
      this.beforeUnloadHandler = () => this.provider.publishLeave();
      window.addEventListener("beforeunload", this.beforeUnloadHandler);

      this.visibilityHandler = () => {
        if (document.visibilityState === "visible") {
          this.participants.set(this.myId, { name: this.name });
          this.startRollCall();
        }
      };
      document.addEventListener("visibilitychange", this.visibilityHandler);
    }
  }

  getSnapshot(): RoomSnapshot {
    const participants: Participant[] = [];
    this.participants.forEach((value: { name: string }, key: string) => {
      participants.push({ id: key, name: value.name });
    });

    const votes: Record<string, string> = {};
    this.votes.forEach((value: string, key: string) => {
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

  destroy(): void {
    if (this.rollCallTimer) clearTimeout(this.rollCallTimer);
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

  private startRollCall(): void {
    if (this.rollCallTimer) clearTimeout(this.rollCallTimer);
    this.rollCallResponders.clear();
    this.rollCallResponders.add(this.myId);
    this.provider.publishPing();

    this.rollCallTimer = setTimeout(() => {
      this.participants.forEach((_value: { name: string }, peerId: string) => {
        if (!this.rollCallResponders.has(peerId)) {
          this.removePeer(peerId);
        }
      });
      this.rollCallTimer = null;
    }, ROLL_CALL_TIMEOUT);
  }

  private removePeer(peerId: string): void {
    this.doc.transact(() => {
      if (this.participants.has(peerId)) this.participants.delete(peerId);
      if (this.votes.has(peerId)) this.votes.delete(peerId);
    });
  }

  private notifyListeners(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
