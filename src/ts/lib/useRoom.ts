import { useState, useEffect, useRef } from "preact/hooks";
import * as Y from "yjs";
import { Room, RoomSnapshot } from "./room";
import { MqttProvider, ConnectionStatus } from "./mqtt-provider";
import { getOrCreateIdentity, getSavedSettings } from "./identity";
import { attachRoomLogger } from "./debug";

export function useRoom(roomId: string, name: string) {
  const roomRef = useRef<Room | null>(null);

  if (!roomRef.current) {
    const myId = getOrCreateIdentity();
    const doc = new Y.Doc();
    const provider = new MqttProvider(doc, roomId, myId);
    roomRef.current = new Room(myId, name, provider, doc, getSavedSettings());
  }
  const room = roomRef.current;

  const [snapshot, setSnapshot] = useState<RoomSnapshot>(() =>
    room.getSnapshot(),
  );
  const [status, setStatus] = useState<ConnectionStatus>({
    type: "reconnecting",
  });

  useEffect(() => {
    const detachLogger = attachRoomLogger(room);
    const unsubscribe = room.subscribe(setSnapshot);
    const unsubStatus = room.subscribeStatus(setStatus);
    return () => {
      unsubStatus();
      detachLogger();
      unsubscribe();
      room.destroy();
      roomRef.current = null;
    };
  }, [room]);

  return { snapshot, status, room };
}
