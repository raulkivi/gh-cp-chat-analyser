import { scaleLinear } from "d3-scale";
import type { TurnUsage } from "@gh-cp-chat-analyser/domain";

const TOKEN_TYPES = [
  { key: "cacheWrite", label: "Cache write" },
  { key: "cacheRead", label: "Cache read" },
  { key: "uncachedInput", label: "Uncached input" },
  { key: "tool", label: "Tool" },
  { key: "vision", label: "Vision" },
  { key: "reasoning", label: "Reasoning" },
  { key: "output", label: "Output" },
] as const satisfies { key: keyof TurnUsage; label: string }[];

const BAR_HEIGHT = 8;
const BAR_GAP = 2;
const MAX_BAR_WIDTH = 80;
const UNAVAILABLE_BAR_WIDTH = 2;

interface TokenTypeBarsProps {
  usage: TurnUsage;
}

export function TokenTypeBars({ usage }: TokenTypeBarsProps) {
  const knownValues = TOKEN_TYPES.map(({ key }) => usage[key]).flatMap((count) =>
    count.known ? [count.value] : [],
  );
  const widthScale = scaleLinear()
    .domain([0, Math.max(1, ...knownValues)])
    .range([0, MAX_BAR_WIDTH])
    .clamp(true);

  return (
    <svg
      role="img"
      aria-label="Token usage by type"
      width={MAX_BAR_WIDTH}
      height={TOKEN_TYPES.length * (BAR_HEIGHT + BAR_GAP)}
    >
      {TOKEN_TYPES.map(({ key, label }, index) => {
        const count = usage[key];
        const y = index * (BAR_HEIGHT + BAR_GAP);
        const width = count.known ? widthScale(count.value) : UNAVAILABLE_BAR_WIDTH;
        const ariaLabel = count.known ? `${label}: ${count.value.toLocaleString()}` : `${label}: unavailable`;

        return (
          <rect
            key={key}
            data-testid={`bar-${key}`}
            aria-label={ariaLabel}
            x={0}
            y={y}
            width={width}
            height={BAR_HEIGHT}
            fill={count.known ? "#4a7" : "#ccc"}
          />
        );
      })}
    </svg>
  );
}
