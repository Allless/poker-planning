export const ROOM_ID_PARAM = "id";

const STORAGE_KEY = "poker-planning-id";
const NAME_KEY = "poker-planning-name";

function generateId(): string {
  return crypto.randomUUID();
}

export function getOrCreateIdentity(): string {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const id = generateId();
  localStorage.setItem(STORAGE_KEY, id);
  return id;
}

export function getSavedName(): string {
  return localStorage.getItem(NAME_KEY) ?? "";
}

export function saveName(name: string): void {
  localStorage.setItem(NAME_KEY, name);
}

const LAST_ROOM_KEY = "poker-planning-last-room";

export function getLastRoom(): string {
  return localStorage.getItem(LAST_ROOM_KEY) ?? "";
}

export function saveLastRoom(roomId: string): void {
  localStorage.setItem(LAST_ROOM_KEY, roomId);
}
