import { scaleLinear } from "d3-scale";
import { line as d3Line } from "d3-shape";
import type { Turn } from "@gh-cp-chat-analyser/domain";

const WIDTH = 200;
const HEIGHT = 30;
const PADDING = 2;

interface CostSparklineProps {
  turns: Turn[];
}

export function CostSparkline({ turns }: CostSparklineProps) {
  const knownPoints = turns.flatMap((turn, index) =>
    turn.usage.costAiCredits.known ? [{ index, cost: turn.usage.costAiCredits.value }] : [],
  );

  if (knownPoints.length < 2) {
    return (
      <svg role="img" aria-label="AI Credits sparkline: not enough data" width={WIDTH} height={HEIGHT}>
        <text data-testid="cost-sparkline-empty" x={PADDING} y={HEIGHT / 2}>
          not enough credit data
        </text>
      </svg>
    );
  }

  const xScale = scaleLinear().domain([0, turns.length - 1]).range([PADDING, WIDTH - PADDING]);
  const maxCost = Math.max(...knownPoints.map((point) => point.cost));
  const yScale = scaleLinear()
    .domain([0, maxCost || 1])
    .range([HEIGHT - PADDING, PADDING]);
  const path = d3Line<{ index: number; cost: number }>()
    .x((point) => xScale(point.index))
    .y((point) => yScale(point.cost))(knownPoints);

  return (
    <svg role="img" aria-label="AI Credits sparkline" width={WIDTH} height={HEIGHT}>
      <path data-testid="cost-sparkline-path" d={path ?? ""} fill="none" stroke="#4a7" strokeWidth={1.5} />
    </svg>
  );
}
