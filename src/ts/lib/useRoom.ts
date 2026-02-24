import { useState, useEffect, useRef } from "preact/hooks";
import { Room, RoomSnapshot } from "./room";
import { attachRoomLogger } from "./debug";

export function useRoom(roomId: string, name: string) {
  const roomRef = useRef<Room | null>(null);

  if (!roomRef.current) {
    roomRef.current = new Room(roomId, name);
  }
  const room = roomRef.current;

  const [snapshot, setSnapshot] = useState<RoomSnapshot>(() =>
    room.getSnapshot(),
  );

  useEffect(() => {
    const detachLogger = attachRoomLogger(room);
    const unsubscribe = room.subscribe(setSnapshot);
    const unsubStatus = room.subscribeStatus((status) => {
      if (status === "failed") {
        const base = import.meta.env.BASE_URL.endsWith("/")
          ? import.meta.env.BASE_URL
          : import.meta.env.BASE_URL + "/";
        window.location.href = new URL(".", new URL(base, window.location.origin)).href;
      }
    });
    return () => {
      unsubStatus();
      detachLogger();
      unsubscribe();
      room.destroy();
      roomRef.current = null;
    };
  }, [room]);

  return { snapshot, room };
}
