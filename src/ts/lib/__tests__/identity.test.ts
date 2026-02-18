import { describe, it, expect, beforeEach, vi } from "vitest";

const store = new Map<string, string>();

const localStorageMock = {
  getItem: vi.fn((key: string) => store.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store.set(key, value);
  }),
  clear: vi.fn(() => {
    store.clear();
  }),
};

vi.stubGlobal("localStorage", localStorageMock);

const { getOrCreateIdentity } = await import("../identity");

describe("getOrCreateIdentity", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it("generates a new UUID on first call", () => {
    const id = getOrCreateIdentity();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("returns the same ID on subsequent calls", () => {
    const first = getOrCreateIdentity();
    const second = getOrCreateIdentity();
    expect(first).toBe(second);
  });

  it("persists the ID to localStorage", () => {
    const id = getOrCreateIdentity();
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "poker-planning-id",
      id,
    );
  });

  it("reads existing ID from localStorage", () => {
    store.set("poker-planning-id", "existing-id");
    const id = getOrCreateIdentity();
    expect(id).toBe("existing-id");
  });
});
