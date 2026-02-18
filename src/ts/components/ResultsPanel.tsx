interface ResultsPanelProps {
  votes: Record<string, string>;
}

export const ResultsPanel = ({ votes }: ResultsPanelProps) => {
  const values = Object.values(votes);
  const numeric = values.map(Number).filter((n) => !isNaN(n));

  const average =
    numeric.length > 0
      ? (numeric.reduce((a, b) => a + b, 0) / numeric.length).toFixed(1)
      : "-";

  const counts = new Map<string, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }

  let mostCommon = "-";
  let maxCount = 0;
  for (const [value, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      mostCommon = value;
    }
  }

  return (
    <div class="results">
      <h2 class="results__title">Results</h2>
      <div class="results__stats">
        <div class="results__stat">
          <span class="results__label">Average</span>
          <span class="results__value">{average}</span>
        </div>
        <div class="results__stat">
          <span class="results__label">Most common</span>
          <span class="results__value">{mostCommon}</span>
        </div>
      </div>
    </div>
  );
};
