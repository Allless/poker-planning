import * as Y from "yjs";
import mqtt from "mqtt";

const REMOTE = "mqtt-remote";
const BROKER_URL = "wss://broker.emqx.io:8084/mqtt";

export type PeerCallback = (peerId: string) => void;
export type StatusCallback = (status: string) => void;

export class MqttProvider {
  private client: mqtt.MqttClient;
  private topic: string;
  private connected = false;
  private participantId: string;

  onHeartbeat: PeerCallback | null = null;
  onPeerLeave: PeerCallback | null = null;
  onStatus: StatusCallback | null = null;

  constructor(doc: Y.Doc, roomId: string, participantId: string) {
    this.topic = `poker-planning/${roomId}`;
    this.participantId = participantId;
    this.client = mqtt.connect(BROKER_URL);

    this.client.on("connect", () => {
      this.connected = true;
      this.onStatus?.("connected");

      this.client.subscribe(`${this.topic}/update`);
      this.client.subscribe(`${this.topic}/sync-request`);
      this.client.subscribe(`${this.topic}/sync-response`);
      this.client.subscribe(`${this.topic}/heartbeat`);
      this.client.subscribe(`${this.topic}/leave`);

      // Request full state from any existing peer
      this.client.publish(`${this.topic}/sync-request`, "");

      // Send initial heartbeat immediately after connecting
      this.publishHeartbeat();
    });

    this.client.on("disconnect", () => {
      this.connected = false;
      this.onStatus?.("disconnected");
    });

    this.client.on("offline", () => {
      this.connected = false;
      this.onStatus?.("offline");
    });

    this.client.on("reconnect", () => {
      this.onStatus?.("reconnecting");
    });

    this.client.on("error", (err) => {
      this.onStatus?.(`error: ${err.message}`);
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
      } else if (_topic === `${this.topic}/heartbeat`) {
        const peerId = new TextDecoder().decode(message);
        if (peerId) this.onHeartbeat?.(peerId);
      } else if (_topic === `${this.topic}/leave`) {
        const peerId = new TextDecoder().decode(message);
        if (peerId) this.onPeerLeave?.(peerId);
      }
    });

    // Broadcast local updates
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE) return;
      if (!this.connected) return;
      this.client.publish(`${this.topic}/update`, update as unknown as string);
    });
  }

  publishHeartbeat(): void {
    if (!this.connected) return;
    this.client.publish(`${this.topic}/heartbeat`, this.participantId);
  }

  publishLeave(): void {
    if (!this.connected) return;
    this.client.publish(`${this.topic}/leave`, this.participantId);
  }

  destroy(): void {
    this.client.end();
  }
}
