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
  onStatus: ((status: ConnectionStatus) => void) | null;
  publishLeave(): void;
  reconnect(force?: boolean): void;
  isConnected(): boolean;
  destroy(): void;
}

export class MqttProvider implements RoomProvider {
  private client!: mqtt.MqttClient;
  private topic: string;
  private connected = false;
  private participantId: string;
  private retries = 0;
  private doc: Y.Doc;
  private destroyed = false;

  onPeerLeave: ((peerId: string) => void) | null = null;
  onStatus: ((status: ConnectionStatus) => void) | null = null;

  constructor(doc: Y.Doc, roomId: string, participantId: string) {
    this.doc = doc;
    this.topic = `poker-planning/${roomId}`;
    this.participantId = participantId;

    // Broadcast local updates. Attached once; reads this.client dynamically so
    // it keeps working across reconnect() rebuilds. Updates made while
    // disconnected are intentionally dropped (peers resync on reconnect).
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE) return;
      if (!this.connected) return;
      this.client.publish(`${this.topic}/update`, update as unknown as string);
    });

    this.connect();
  }

  /** Build a fresh MQTT client and wire its event handlers. */
  private connect(): void {
    this.retries = 0;
    this.client = mqtt.connect(BROKER_URL, {
      keepalive: 30,
      reconnectPeriod: 2000,
      connectTimeout: 10_000,
    });

    this.client.on("connect", () => {
      this.connected = true;
      this.retries = 0;
      this.onStatus?.({ type: "connected" });

      this.client.subscribe(`${this.topic}/update`);
      this.client.subscribe(`${this.topic}/sync-request`);
      this.client.subscribe(`${this.topic}/sync-response`);
      this.client.subscribe(`${this.topic}/leave`);

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
        // Stop hammering the broker, but stay recoverable: reconnect() can
        // rebuild a fresh client (e.g. on tab focus or the manual button).
        this.client.end(true);
        this.connected = false;
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
        Y.applyUpdate(this.doc, new Uint8Array(message), REMOTE);
      } else if (_topic === `${this.topic}/sync-request`) {
        const state = Y.encodeStateAsUpdate(this.doc);
        this.client.publish(
          `${this.topic}/sync-response`,
          state as unknown as string,
        );
      } else if (_topic === `${this.topic}/sync-response`) {
        Y.applyUpdate(this.doc, new Uint8Array(message), REMOTE);
      } else if (_topic === `${this.topic}/leave`) {
        const peerId = new TextDecoder().decode(message);
        if (peerId) this.onPeerLeave?.(peerId);
      }
    });
  }

  /**
   * Re-establish the connection in place, preserving the Yjs doc. Used after a
   * long sleep/background where the socket died and mqtt.js gave up. Rebuilds
   * a fresh client rather than relying on reconnect-after-end semantics.
   *
   * Automatic triggers (tab focus, network online) pass force=false and skip
   * when already connected. The manual button passes force=true to rebuild
   * even when the status claims "connected" — covering a silently dead socket
   * that mqtt.js hasn't noticed yet.
   */
  reconnect(force = false): void {
    if (this.destroyed) return;
    if (this.connected && !force) return;

    this.connected = false;
    this.client.removeAllListeners();
    this.client.end(true);
    this.onStatus?.({ type: "reconnecting" });
    this.connect();
  }

  isConnected(): boolean {
    return this.connected;
  }

  publishLeave(): void {
    if (!this.connected) return;
    this.client.publish(`${this.topic}/leave`, this.participantId);
  }

  destroy(): void {
    this.destroyed = true;
    this.client.end();
  }
}
