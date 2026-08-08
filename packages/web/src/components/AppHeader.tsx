import type { Mode } from "../state/session-store.js";
import { Blueprint } from "./ui/Blueprint.js";
import { SegmentedControl } from "./ui/SegmentedControl.js";
import { Tag } from "./ui/Tag.js";

const MODE_OPTIONS = [
  { value: "learn", label: "Learn" },
  { value: "analyze", label: "Analyze" },
] as const;

interface AppHeaderProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  hasConfigWarnings: boolean;
  onConfigClick: () => void;
}

export function AppHeader({ mode, onModeChange, hasConfigWarnings, onConfigClick }: AppHeaderProps) {
  return (
    <header className="nav">
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginRight: "auto" }}>
        <Blueprint
          style={{ width: 32, height: 32, flex: "none", background: "var(--color-accent-900)" }}
        />
        <div>
          <div className="nav-brand">Session Analyser</div>
          <div style={{ fontSize: 11, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
            GitHub Copilot Chat
          </div>
        </div>
      </div>
      <SegmentedControl name="mode" options={MODE_OPTIONS} value={mode} onChange={onModeChange} />
      {hasConfigWarnings ? (
        <button
          className="btn btn-secondary"
          style={{ marginLeft: "var(--space-2)" }}
          onClick={onConfigClick}
        >
          Config
        </button>
      ) : (
        <Tag variant="neutral" style={{ marginLeft: "var(--space-2)" }}>
          Config &#10003;
        </Tag>
      )}
    </header>
  );
}
