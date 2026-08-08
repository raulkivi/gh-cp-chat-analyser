import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TurnUsage } from "@gh-cp-chat-analyser/domain";
import { CacheHitRatio } from "./CacheHitRatio.js";

const usage: TurnUsage = {
  uncachedInput: { known: true, value: 100 },
  cacheWrite: { known: true, value: 150 },
  cacheRead: { known: true, value: 300 },
  tool: { known: true, value: 0 },
  vision: { known: true, value: 0 },
  reasoning: { known: true, value: 10 },
  output: { known: true, value: 60 },
  costUsd: { known: true, value: 0.01 },
  model: "example-model",
};

describe("CacheHitRatio", () => {
  it("shows the cache-hit percentage when both cache and uncached counts are known", () => {
    // 300 cache read out of 400 total (300 + 100 uncached) = 75%.
    render(<CacheHitRatio usage={usage} />);

    expect(screen.getByRole("img", { name: /75%/ })).toBeInTheDocument();
  });

  it("marks the ratio unavailable when the cache-read count is unknown", () => {
    const partiallyUnknown: TurnUsage = {
      ...usage,
      cacheRead: { known: false, reason: "not tracked for this event shape" },
    };

    render(<CacheHitRatio usage={partiallyUnknown} />);

    expect(screen.getByRole("img", { name: /unavailable/i })).toBeInTheDocument();
  });

  it("marks the ratio unavailable when the uncached-input count is unknown", () => {
    const partiallyUnknown: TurnUsage = {
      ...usage,
      uncachedInput: { known: false, reason: "not tracked for this event shape" },
    };

    render(<CacheHitRatio usage={partiallyUnknown} />);

    expect(screen.getByRole("img", { name: /unavailable/i })).toBeInTheDocument();
  });
});
