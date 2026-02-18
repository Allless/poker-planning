import { render } from "preact";
import { useState } from "preact/hooks";
import { useRoom } from "./lib/useRoom";
import { getSavedName, saveName, saveLastRoom } from "./lib/identity";
import { TopBar } from "./components/TopBar";
import { CardDeck } from "./components/CardDeck";
import { ParticipantList } from "./components/ParticipantList";
import { ResultsPanel } from "./components/ResultsPanel";

const getRoomId = (): string | null => {
  const params = new URLSearchParams(window.location.search);
  return params.get("room");
};

const RoomPage = ({ roomId, name }: { roomId: string; name: string }) => {
  const { snapshot, room } = useRoom(roomId, name);
  const myVote = snapshot.votes[snapshot.myId] ?? null;

  const handleVote = (value: string) => {
    if (value === "") {
      room.clearVote();
    } else {
      room.vote(value);
    }
  };

  return (
    <div class="room">
      <TopBar roomId={roomId} />

      <CardDeck
        selected={myVote}
        onSelect={handleVote}
        disabled={snapshot.phase === "revealed"}
      />

      <div class="room__actions">
        {snapshot.phase === "voting" ? (
          <button class="btn btn--primary" onClick={() => room.reveal()}>
            Reveal Votes
          </button>
        ) : (
          <button class="btn btn--primary" onClick={() => room.reset()}>
            New Round
          </button>
        )}
      </div>

      <ParticipantList
        participants={snapshot.participants}
        votes={snapshot.votes}
        phase={snapshot.phase}
        myId={snapshot.myId}
      />

      {snapshot.phase === "revealed" && <ResultsPanel votes={snapshot.votes} />}
    </div>
  );
};

const NameGate = ({ roomId }: { roomId: string }) => {
  const [name, setName] = useState(getSavedName());
  const [joined, setJoined] = useState(false);

  const handleJoin = () => {
    if (!name.trim()) return;
    saveName(name.trim());
    saveLastRoom(roomId);
    setJoined(true);
  };

  if (joined) {
    return <RoomPage roomId={roomId} name={name.trim()} />;
  }

  return (
    <div class="landing">
      <h1>Join Room</h1>
      <div class="landing__form">
        <input
          class="input"
          type="text"
          placeholder="Your name"
          value={name}
          onInput={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && handleJoin()}
        />
        <button
          class="btn btn--primary"
          disabled={!name.trim()}
          onClick={handleJoin}
        >
          {name.trim() ? `Continue as ${name.trim()}` : "Enter your name"}
        </button>
      </div>
    </div>
  );
};

const App = () => {
  const roomId = getRoomId();

  if (!roomId) {
    return (
      <div class="error">
        <h1>Invalid Room</h1>
        <p>Missing room ID.</p>
        <a href="./" class="btn btn--primary">
          Go Home
        </a>
      </div>
    );
  }

  return <NameGate roomId={roomId} />;
};

const root = document.getElementById("app");
if (root) render(<App />, root);
