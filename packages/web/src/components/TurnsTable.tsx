import type { TokenCount, Turn } from "@gh-cp-chat-analyser/domain";
import { CacheHitRatio } from "../charts/CacheHitRatio.js";
import { CostSparkline } from "../charts/CostSparkline.js";
import { TokenTypeBars } from "../charts/TokenTypeBars.js";

function formatTokenCount(tokenCount: TokenCount): string {
  return tokenCount.known ? tokenCount.value.toLocaleString() : "unavailable";
}

function formatCost(tokenCount: TokenCount): string {
  return tokenCount.known ? `$${tokenCount.value.toFixed(4)}` : "unavailable";
}

interface TurnsTableProps {
  turns: Turn[];
  selectedTurnIndex: number;
  onSelectTurn: (turnIndex: number) => void;
}

export function TurnsTable({ turns, selectedTurnIndex, onSelectTurn }: TurnsTableProps) {
  return (
    <div>
      <CostSparkline turns={turns} />
      <table>
        <thead>
          <tr>
            <th>Turn</th>
            <th>Cache write</th>
            <th>Cache read</th>
            <th>Uncached</th>
            <th>Tool</th>
            <th>Vision</th>
            <th>Reasoning</th>
            <th>Output</th>
            <th>Cost</th>
            <th>Usage</th>
            <th>Cache hit</th>
          </tr>
        </thead>
        <tbody>
          {turns.map((turn, turnIndex) => (
            <tr
              key={turn.index}
              aria-selected={turnIndex === selectedTurnIndex}
              onClick={() => onSelectTurn(turnIndex)}
            >
              <td>{turn.index}</td>
              <td>{formatTokenCount(turn.usage.cacheWrite)}</td>
              <td>{formatTokenCount(turn.usage.cacheRead)}</td>
              <td>{formatTokenCount(turn.usage.uncachedInput)}</td>
              <td>{formatTokenCount(turn.usage.tool)}</td>
              <td>{formatTokenCount(turn.usage.vision)}</td>
              <td>{formatTokenCount(turn.usage.reasoning)}</td>
              <td>{formatTokenCount(turn.usage.output)}</td>
              <td>{formatCost(turn.usage.costUsd)}</td>
              <td>
                <TokenTypeBars usage={turn.usage} />
              </td>
              <td>
                <CacheHitRatio usage={turn.usage} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
