import type { SystemPromptComponent, TokenCount } from "@gh-cp-chat-analyser/domain";

function formatTokenCount(tokenCount: TokenCount): string {
  return tokenCount.known ? tokenCount.value.toLocaleString() : "unavailable";
}

interface SystemPromptBreakdownProps {
  components: SystemPromptComponent[];
}

export function SystemPromptBreakdown({ components }: SystemPromptBreakdownProps) {
  return (
    <section>
      <h2>System prompt breakdown</h2>
      {components.length === 0 ? (
        <p>No system-prompt breakdown available for this session.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Kind</th>
              <th>Component</th>
              <th>Token count</th>
            </tr>
          </thead>
          <tbody>
            {components.map((component) => (
              <tr key={`${component.kind}-${component.label}`}>
                <td>{component.kind}</td>
                <td>{component.label}</td>
                <td>{formatTokenCount(component.tokenCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
