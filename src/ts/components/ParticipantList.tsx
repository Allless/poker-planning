import { Participant, Phase } from "../lib/room";

interface ParticipantListProps {
  participants: Participant[];
  votes: Record<string, string>;
  phase: Phase;
  myId: string;
}

export const ParticipantList = ({
  participants,
  votes,
  phase,
  myId,
}: ParticipantListProps) => {
  return (
    <div class="participant-list">
      <h2 class="participant-list__title">Participants</h2>
      <ul class="participant-list__items">
        {participants.map((p) => {
          const vote = votes[p.id];
          const isMe = p.id === myId;

          return (
            <li key={p.id} class="participant">
              <span class="participant__name">
                {p.name}
                {isMe && <span class="participant__you"> (you)</span>}
              </span>
              <span class="participant__vote">
                {phase === "revealed"
                  ? (vote ?? "-")
                  : vote
                    ? "\u2705"
                    : "\u23F3"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
