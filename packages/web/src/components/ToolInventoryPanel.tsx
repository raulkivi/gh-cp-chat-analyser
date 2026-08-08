import type { ToolInventoryEntry } from "@gh-cp-chat-analyser/domain";
import { Blueprint } from "./ui/Blueprint.js";
import { Tag } from "./ui/Tag.js";

interface ToolInventoryPanelProps {
  entries: ToolInventoryEntry[];
}

export function ToolInventoryPanel({ entries }: ToolInventoryPanelProps) {
  return (
    <Blueprint style={{ padding: "var(--space-3)" }}>
      <div className="card-kicker" style={{ marginBottom: "var(--space-3)" }}>
        Tools: loaded vs. used
      </div>
      {entries.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
          No tool inventory captured for this session.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {entries.map((entry) => (
            <div key={entry.name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span
                title={entry.name}
                className="truncate"
                style={{ flex: 1, fontFamily: "monospace", fontSize: 12, maxWidth: 150 }}
              >
                {entry.name}
              </span>
              <Tag variant={entry.loaded ? "neutral" : "outline"}>
                {entry.loaded ? "loaded" : "not loaded"}
              </Tag>
              <Tag variant={entry.invokedInTurns.length > 0 ? "accent" : "neutral"}>
                {entry.invokedInTurns.length > 0
                  ? `used in ${entry.invokedInTurns.length} turns`
                  : "not invoked"}
              </Tag>
            </div>
          ))}
        </div>
      )}
    </Blueprint>
  );
}
