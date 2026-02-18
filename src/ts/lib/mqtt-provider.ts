import * as Y from "yjs";
import mqtt from "mqtt";

const REMOTE = "mqtt-remote";
const BROKER_URL = "wss://broker.emqx.io:8084/mqtt";

export class MqttProvider {
  private client: mqtt.MqttClient;
  private topic: string;
  private connected = false;

  constructor(doc: Y.Doc, roomId: string) {
    this.topic = `poker-planning/${roomId}`;
    this.client = mqtt.connect(BROKER_URL);

    this.client.on("connect", () => {
      this.connected = true;

      this.client.subscribe(`${this.topic}/update`);
      this.client.subscribe(`${this.topic}/sync-request`);
      this.client.subscribe(`${this.topic}/sync-response`);

      // Request full state from any existing peer
      this.client.publish(`${this.topic}/sync-request`, "");
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
      }
    });

    // Broadcast local updates
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE) return;
      if (!this.connected) return;
      this.client.publish(`${this.topic}/update`, update as unknown as string);
    });
  }

  destroy(): void {
    this.client.end();
  }
}
