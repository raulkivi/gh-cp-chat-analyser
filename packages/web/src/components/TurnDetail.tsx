import type { TokenCount, Turn } from "@gh-cp-chat-analyser/domain";

function formatTokenCount(tokenCount: TokenCount | undefined): string {
  return tokenCount?.known ? tokenCount.value.toLocaleString() : "unavailable";
}

interface TurnDetailProps {
  turn: Turn | null;
}

export function TurnDetail({ turn }: TurnDetailProps) {
  return (
    <section>
      <h2>Turn detail</h2>
      {!turn ? (
        <p>No turn selected.</p>
      ) : turn.toolCalls.length === 0 ? (
        <p>No tool calls in this turn.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Tool</th>
              <th>Files touched</th>
              <th>Token count</th>
            </tr>
          </thead>
          <tbody>
            {turn.toolCalls.map((toolCall, index) => (
              <tr key={`${toolCall.name}-${index}`}>
                <td>{toolCall.name}</td>
                <td>{toolCall.filesTouched?.join(", ") ?? "—"}</td>
                <td>{formatTokenCount(toolCall.tokenCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
