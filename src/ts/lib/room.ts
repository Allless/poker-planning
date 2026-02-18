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

export class Room {
  readonly myId: string;
  private doc: Y.Doc;
  private provider: MqttProvider;
  private votes: Y.Map<string>;
  private participants: Y.Map<{ name: string }>;
  private meta: Y.Map<string>;
  private listeners = new Set<RoomListener>();

  constructor(roomId: string, name: string) {
    this.myId = getOrCreateIdentity();
    this.doc = new Y.Doc();

    this.provider = new MqttProvider(this.doc, roomId);

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
    this.participants.delete(this.myId);
    this.provider.destroy();
    this.doc.destroy();
    this.listeners.clear();
  }

  private notifyListeners(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
