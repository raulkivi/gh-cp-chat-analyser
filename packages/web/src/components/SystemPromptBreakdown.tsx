import type { SystemPromptComponent, TokenCount } from "@gh-cp-chat-analyser/domain";
import { Blueprint } from "./ui/Blueprint.js";

function formatTokenCount(tokenCount: TokenCount): string {
  return tokenCount.known ? tokenCount.value.toLocaleString() : "—";
}

function barWidthPercent(tokenCount: TokenCount, maxValue: number): number {
  if (!tokenCount.known || maxValue === 0) return 0;
  return (tokenCount.value / maxValue) * 100;
}

interface SystemPromptBreakdownProps {
  components: SystemPromptComponent[];
}

export function SystemPromptBreakdown({ components }: SystemPromptBreakdownProps) {
  const maxValue = Math.max(
    0,
    ...components.map((component) => (component.tokenCount.known ? component.tokenCount.value : 0)),
  );

  return (
    <Blueprint style={{ padding: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <div className="card-kicker">System prompt breakdown</div>
      {components.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
          No prompt artifacts captured for this session — enable agentDebugLog.fileLogging.enabled and reload VS
          Code.
        </p>
      ) : (
        components.map((component) => (
          <div key={`${component.kind}-${component.label}`}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
              <span>{component.label}</span>
              <span className="text-muted">{formatTokenCount(component.tokenCount)}</span>
            </div>
            <div style={{ height: 5, background: "var(--color-surface)", border: "1px solid var(--color-divider)" }}>
              <div
                data-testid={`prompt-bar-fill-${component.label}`}
                style={{
                  height: "100%",
                  background: "var(--color-accent)",
                  width: `${barWidthPercent(component.tokenCount, maxValue)}%`,
                }}
              />
            </div>
          </div>
        ))
      )}
    </Blueprint>
  );
}
