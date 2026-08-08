import { scaleLinear } from "d3-scale";
import type { TurnUsage } from "@gh-cp-chat-analyser/domain";

const BAR_WIDTH = 80;
const BAR_HEIGHT = 8;

interface CacheHitRatioProps {
  usage: TurnUsage;
}

export function CacheHitRatio({ usage }: CacheHitRatioProps) {
  const { cacheRead, uncachedInput } = usage;

  if (!cacheRead.known || !uncachedInput.known) {
    return (
      <svg role="img" aria-label="Cache hit ratio: unavailable" width={BAR_WIDTH} height={BAR_HEIGHT}>
        <rect
          data-testid="cache-hit-unavailable"
          x={0}
          y={0}
          width={BAR_WIDTH}
          height={BAR_HEIGHT}
          fill="#ccc"
        />
      </svg>
    );
  }

  const total = cacheRead.value + uncachedInput.value;
  const ratio = total === 0 ? 0 : cacheRead.value / total;
  const percentLabel = `${Math.round(ratio * 100)}%`;
  const fillWidth = scaleLinear().domain([0, 1]).range([0, BAR_WIDTH])(ratio);

  return (
    <svg role="img" aria-label={`Cache hit ratio: ${percentLabel}`} width={BAR_WIDTH} height={BAR_HEIGHT}>
      <rect data-testid="cache-hit-total" x={0} y={0} width={BAR_WIDTH} height={BAR_HEIGHT} fill="#eee" />
      <rect data-testid="cache-hit-fill" x={0} y={0} width={fillWidth} height={BAR_HEIGHT} fill="#4a7" />
    </svg>
  );
}
