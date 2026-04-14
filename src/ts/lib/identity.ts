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

const SETTINGS_KEY = "poker-planning-settings";

export interface RoomSettings {
  autoReveal: boolean;
}

const DEFAULT_SETTINGS: RoomSettings = { autoReveal: false };

export function getSavedSettings(): RoomSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: RoomSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

const LAST_ROOM_KEY = "poker-planning-last-room";

export function getLastRoom(): string {
  return localStorage.getItem(LAST_ROOM_KEY) ?? "";
}

export function saveLastRoom(roomId: string): void {
  localStorage.setItem(LAST_ROOM_KEY, roomId);
}
