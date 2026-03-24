import * as Y from "yjs";
import mqtt from "mqtt";

const REMOTE = "mqtt-remote";
const BROKER_URL = "wss://broker.emqx.io:8084/mqtt";
const MAX_RETRIES = 5;

export type ConnectionStatus =
  | { type: "connected" }
  | { type: "disconnected" }
  | { type: "offline" }
  | { type: "reconnecting" }
  | { type: "failed" }
  | { type: "error"; message: string };

export interface RoomProvider {
  onPeerLeave: ((peerId: string) => void) | null;
  onPing: ((peerId: string) => void) | null;
  onPong: ((peerId: string, name: string) => void) | null;
  onStatus: ((status: ConnectionStatus) => void) | null;
  publishPing(): void;
  publishPong(name: string): void;
  publishLeave(): void;
  destroy(): void;
}

export class MqttProvider implements RoomProvider {
  private client: mqtt.MqttClient;
  private topic: string;
  private connected = false;
  private participantId: string;
  private retries = 0;

  onPeerLeave: ((peerId: string) => void) | null = null;
  onPing: ((peerId: string) => void) | null = null;
  onPong: ((peerId: string, name: string) => void) | null = null;
  onStatus: ((status: ConnectionStatus) => void) | null = null;

  constructor(doc: Y.Doc, roomId: string, participantId: string) {
    this.topic = `poker-planning/${roomId}`;
    this.participantId = participantId;
    this.client = mqtt.connect(BROKER_URL);

    this.client.on("connect", () => {
      this.connected = true;
      this.retries = 0;
      this.onStatus?.({ type: "connected" });

      this.client.subscribe(`${this.topic}/update`);
      this.client.subscribe(`${this.topic}/sync-request`);
      this.client.subscribe(`${this.topic}/sync-response`);
      this.client.subscribe(`${this.topic}/leave`);
      this.client.subscribe(`${this.topic}/ping`);
      this.client.subscribe(`${this.topic}/pong`);

      // Request full state from any existing peer
      this.client.publish(`${this.topic}/sync-request`, "");
    });

    this.client.on("disconnect", () => {
      this.connected = false;
      this.onStatus?.({ type: "disconnected" });
    });

    this.client.on("offline", () => {
      this.connected = false;
      this.onStatus?.({ type: "offline" });
    });

    this.client.on("reconnect", () => {
      this.retries++;
      if (this.retries > MAX_RETRIES) {
        this.client.end();
        this.onStatus?.({ type: "failed" });
        return;
      }
      this.onStatus?.({ type: "reconnecting" });
    });

    this.client.on("error", (err) => {
      this.onStatus?.({ type: "error", message: err.message });
    });

    this.client.on("message", (_topic: string, message: Uint8Array) => {
      if (_topic === `${this.topic}/update`) {
        Y.applyUpdate(doc, new Uint8Array(message), REMOTE);
      } else if (_topic === `${this.topic}/sync-request`) {
        const state = Y.encodeStateAsUpdate(doc);
        this.client.publish(
          `${this.topic}/sync-response`,
          state as unknown as string,
        );
      } else if (_topic === `${this.topic}/sync-response`) {
        Y.applyUpdate(doc, new Uint8Array(message), REMOTE);
      } else if (_topic === `${this.topic}/leave`) {
        const peerId = new TextDecoder().decode(message);
        if (peerId) this.onPeerLeave?.(peerId);
      } else if (_topic === `${this.topic}/ping`) {
        const peerId = new TextDecoder().decode(message);
        if (peerId) this.onPing?.(peerId);
      } else if (_topic === `${this.topic}/pong`) {
        const payload = new TextDecoder().decode(message);
        const sep = payload.indexOf(":");
        if (sep > 0) {
          this.onPong?.(payload.slice(0, sep), payload.slice(sep + 1));
        }
      }
    });

    // Broadcast local updates
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE) return;
      if (!this.connected) return;
      this.client.publish(`${this.topic}/update`, update as unknown as string);
    });
  }

  publishPing(): void {
    if (!this.connected) return;
    this.client.publish(`${this.topic}/ping`, this.participantId);
  }

  publishPong(name: string): void {
    if (!this.connected) return;
    this.client.publish(`${this.topic}/pong`, `${this.participantId}:${name}`);
  }

  publishLeave(): void {
    if (!this.connected) return;
    this.client.publish(`${this.topic}/leave`, this.participantId);
  }

  destroy(): void {
    this.client.end();
  }
}
