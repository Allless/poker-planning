import { describe, it, expect, vi, beforeEach } from "vitest";
import * as Y from "yjs";

// Mock MQTT broker — routes messages between clients subscribed to the same topic
type MessageHandler = (topic: string, message: Buffer) => void;

interface MockClient {
  subscriptions: Set<string>;
  onMessage: MessageHandler | null;
  onConnect: (() => void) | null;
  ended: boolean;
}

let clients: MockClient[] = [];

const createMockClient = (): MockClient => {
  const client: MockClient = {
    subscriptions: new Set(),
    onMessage: null,
    onConnect: null,
    ended: false,
  };
  clients.push(client);
  return client;
};

beforeEach(() => {
  clients = [];
});

vi.mock("mqtt", () => ({
  default: {
    connect: () => {
      const client = createMockClient();

      const api = {
        on: (event: string, cb: (...args: unknown[]) => void) => {
          if (event === "connect") {
            client.onConnect = cb as () => void;
            // Simulate async connect
            setTimeout(() => cb(), 0);
          }
          if (event === "message") {
            client.onMessage = cb as MessageHandler;
          }
          return api;
        },
        subscribe: (topic: string) => {
          client.subscriptions.add(topic);
        },
        publish: (topic: string, data: Buffer | string) => {
          const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
          // Deliver to ALL clients subscribed to this topic (including self)
          for (const other of clients) {
            if (other.ended) continue;
            if (other.subscriptions.has(topic) && other.onMessage) {
              other.onMessage(topic, buffer);
            }
          }
        },
        end: () => {
          client.ended = true;
        },
      };

      return api;
    },
  },
}));

const { MqttProvider } = await import("../mqtt-provider");

// Helper to flush pending microtasks/timers
const flush = () => new Promise((r) => setTimeout(r, 10));

describe("MqttProvider", () => {
  it("syncs updates from doc1 to doc2 after connection", async () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    new MqttProvider(doc1, "test-room");
    new MqttProvider(doc2, "test-room");

    // Wait for "connect" callbacks to fire
    await flush();

    doc1.getMap("votes").set("alice", "5");
    expect(doc2.getMap("votes").get("alice")).toBe("5");
  });

  it("syncs updates bidirectionally", async () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    new MqttProvider(doc1, "test-room");
    new MqttProvider(doc2, "test-room");
    await flush();

    doc1.getMap("votes").set("alice", "5");
    doc2.getMap("votes").set("bob", "8");

    expect(doc1.getMap("votes").get("bob")).toBe("8");
    expect(doc2.getMap("votes").get("alice")).toBe("5");
  });

  it("sends full state to late joiners via sync-request", async () => {
    const doc1 = new Y.Doc();
    new MqttProvider(doc1, "test-room");
    await flush();

    // Doc1 has existing state
    doc1.getMap("votes").set("alice", "5");
    doc1.getMap("meta").set("phase", "voting");

    // Doc2 joins late — its connect triggers a sync-request
    const doc2 = new Y.Doc();
    new MqttProvider(doc2, "test-room");
    await flush();

    expect(doc2.getMap("votes").get("alice")).toBe("5");
    expect(doc2.getMap("meta").get("phase")).toBe("voting");
  });

  it("does not echo remote updates back", async () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    new MqttProvider(doc1, "test-room");
    new MqttProvider(doc2, "test-room");
    await flush();

    // Count publishes from doc1's client
    const doc1Client = clients[0];
    let publishCount = 0;
    const origOnMessage = doc1Client.onMessage;
    doc1Client.onMessage = (topic, msg) => {
      if (topic.endsWith("/update")) publishCount++;
      origOnMessage?.(topic, msg);
    };

    doc2.getMap("votes").set("bob", "3");

    // doc1 received the update (1 delivery), should NOT re-publish it
    expect(doc1.getMap("votes").get("bob")).toBe("3");
    // Only 1 message received, not re-broadcast
    expect(publishCount).toBe(1);
  });

  it("cleans up on destroy", async () => {
    const doc = new Y.Doc();
    const provider = new MqttProvider(doc, "test-room");
    await flush();

    provider.destroy();
    expect(clients[0].ended).toBe(true);
  });
});
