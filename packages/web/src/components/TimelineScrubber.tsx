interface TimelineScrubberProps {
  turnCount: number;
  selectedTurnIndex: number;
  onSelectTurn: (turnIndex: number) => void;
}

export function TimelineScrubber({ turnCount, selectedTurnIndex, onSelectTurn }: TimelineScrubberProps) {
  return (
    <input
      type="range"
      role="slider"
      min={0}
      max={Math.max(turnCount - 1, 0)}
      value={selectedTurnIndex}
      onChange={(event) => onSelectTurn(Number(event.target.value))}
    />
  );
}
