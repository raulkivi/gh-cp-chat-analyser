import type { Turn } from "@gh-cp-chat-analyser/domain";

interface ExplanationPanelProps {
  turn: Turn | null;
}

export function ExplanationPanel({ turn }: ExplanationPanelProps) {
  return (
    <aside>
      <h2>Explanation</h2>
      <p>{turn ? turn.explanation : "No turn selected."}</p>
    </aside>
  );
}
