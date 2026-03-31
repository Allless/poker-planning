import { Participant, Phase } from "../lib/room";

interface ParticipantListProps {
  participants: Participant[];
  votes: Record<string, string>;
  inactive: Set<string>;
  phase: Phase;
  myId: string;
  onKick: (peerId: string) => void;
}

export const ParticipantList = ({
  participants,
  votes,
  inactive,
  phase,
  myId,
  onKick,
}: ParticipantListProps) => {
  return (
    <div class="participant-list">
      <h2 class="participant-list__title">Participants</h2>
      <ul class="participant-list__items">
        {participants.map((p) => {
          const vote = votes[p.id];
          const isMe = p.id === myId;
          const isInactive = inactive.has(p.id);

          return (
            <li key={p.id} class={`participant${isInactive ? " participant--inactive" : ""}`}>
              <span class="participant__name">
                {p.name}
                {isMe && <span class="participant__you"> (you)</span>}
              </span>
              <span class="participant__actions">
                {isInactive && (
                  <button
                    class="participant__kick"
                    onClick={() => onKick(p.id)}
                    title="Remove inactive participant"
                  >
                    &times;
                  </button>
                )}
                <span class="participant__vote">
                  {phase === "revealed"
                    ? (vote ?? "-")
                    : vote
                      ? "\u2705"
                      : "\u23F3"}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
