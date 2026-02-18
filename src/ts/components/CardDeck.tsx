const CARDS = ["0", "1", "2", "3", "5", "8", "13", "21", "34", "?", "\u2615"];

interface CardDeckProps {
  selected: string | null;
  onSelect: (value: string) => void;
  disabled: boolean;
}

export const CardDeck = ({ selected, onSelect, disabled }: CardDeckProps) => {
  return (
    <div class="card-deck">
      {CARDS.map((value) => (
        <button
          key={value}
          class={`card ${selected === value ? "card--selected" : ""}`}
          disabled={disabled}
          onClick={() => onSelect(selected === value ? "" : value)}
        >
          {value}
        </button>
      ))}
    </div>
  );
};
