import { useState, useEffect, useRef } from "preact/hooks";
import { Room, RoomSnapshot } from "./room";

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
    const unsubscribe = room.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      room.destroy();
      roomRef.current = null;
    };
  }, [room]);

  return { snapshot, room };
}
