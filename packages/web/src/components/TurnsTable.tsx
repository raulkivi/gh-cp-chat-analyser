import type { TokenCount, Turn } from "@gh-cp-chat-analyser/domain";
import { onKeyActivate } from "../lib/on-key-activate.js";
import { TRIGGER_LABELS } from "../lib/trigger-labels.js";
import { Tag } from "./ui/Tag.js";

function formatTokenCount(tokenCount: TokenCount): string {
  return tokenCount.known ? tokenCount.value.toLocaleString() : "—";
}

function formatCost(tokenCount: TokenCount): string {
  return tokenCount.known ? `$${tokenCount.value.toFixed(4)}` : "—";
}

interface TurnsTableProps {
  turns: Turn[];
  selectedTurnIndex: number;
  onSelectTurn: (turnIndex: number) => void;
}

export function TurnsTable({ turns, selectedTurnIndex, onSelectTurn }: TurnsTableProps) {
  return (
    <table className="table" style={{ minWidth: 760 }}>
      <thead>
        <tr>
          <th>Turn</th>
          <th>Trigger</th>
          <th>Uncached in</th>
          <th>Cache read</th>
          <th>Cache write</th>
          <th>Tool</th>
          <th>Vision</th>
          <th>Reasoning</th>
          <th>Output</th>
          <th>Cost</th>
          <th>Model</th>
        </tr>
      </thead>
      <tbody>
        {turns.map((turn, turnIndex) => (
          <tr
            key={turn.index}
            aria-selected={turnIndex === selectedTurnIndex}
            tabIndex={0}
            style={{
              cursor: "pointer",
              background: turnIndex === selectedTurnIndex ? "var(--color-accent-100)" : undefined,
            }}
            onClick={() => onSelectTurn(turnIndex)}
            onKeyDown={onKeyActivate(() => onSelectTurn(turnIndex))}
          >
            <td>{turn.index}</td>
            <td className="truncate" style={{ maxWidth: 100 }}>
              {turn.triggeredEvent ? (
                <Tag variant="outline">{TRIGGER_LABELS[turn.triggeredEvent]}</Tag>
              ) : (
                <span className="text-muted">—</span>
              )}
            </td>
            <td>{formatTokenCount(turn.usage.uncachedInput)}</td>
            <td>{formatTokenCount(turn.usage.cacheRead)}</td>
            <td>{formatTokenCount(turn.usage.cacheWrite)}</td>
            <td>{formatTokenCount(turn.usage.tool)}</td>
            <td>{formatTokenCount(turn.usage.vision)}</td>
            <td>{formatTokenCount(turn.usage.reasoning)}</td>
            <td>{formatTokenCount(turn.usage.output)}</td>
            <td>{formatCost(turn.usage.costUsd)}</td>
            <td className="text-muted truncate" style={{ fontSize: 12, maxWidth: 110 }}>
              {turn.usage.model}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
