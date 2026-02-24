import { render } from "preact";
import { useState } from "preact/hooks";
import { getLastRoom, ROOM_ID_PARAM } from "./lib/identity";

const generateRoomId = (): string => {
  return crypto.randomUUID().slice(0, 8);
};

const navigateToRoom = (roomId: string) => {
  const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + "/";
  const url = new URL("room", new URL(base, window.location.origin));
  url.searchParams.set(ROOM_ID_PARAM, roomId);
  window.location.href = url.href;
};

const LandingPage = () => {
  const [joinId, setJoinId] = useState(getLastRoom());

  const handleJoin = () => {
    let roomId = joinId.trim();
    if (!roomId) return;
    try {
      const url = new URL(roomId);
      roomId = url.searchParams.get(ROOM_ID_PARAM) ?? roomId;
    } catch {
      // Not a URL, treat as room ID
    }
    navigateToRoom(roomId);
  };

  return (
    <div class="landing">
      <h1>Poker Planning</h1>
      <p>Estimate stories together, no server required.</p>

      <div class="landing__form">
        <button
          class="btn btn--primary"
          onClick={() => navigateToRoom(generateRoomId())}
        >
          Create Room
        </button>

        <div class="landing__divider">or join an existing room</div>

        <input
          class="input"
          type="text"
          placeholder="Room ID or link"
          value={joinId}
          onInput={(e) => setJoinId(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
        />

        <button
          class="btn btn--secondary"
          disabled={!joinId.trim()}
          onClick={handleJoin}
        >
          Join Room
        </button>

      </div>
    </div>
  );
};

const root = document.getElementById("app");
if (root) render(<LandingPage />, root);
