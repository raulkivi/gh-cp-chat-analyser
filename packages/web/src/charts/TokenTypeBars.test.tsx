import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TurnUsage } from "@gh-cp-chat-analyser/domain";
import { TokenTypeBars } from "./TokenTypeBars.js";

const usage: TurnUsage = {
  uncachedInput: { known: true, value: 100 },
  cacheWrite: { known: true, value: 150 },
  cacheRead: { known: true, value: 300 },
  tool: { known: true, value: 0 },
  vision: { known: true, value: 0 },
  reasoning: { known: false, reason: "not tracked for this event shape" },
  output: { known: true, value: 60 },
  costUsd: { known: true, value: 0.01 },
  model: "example-model",
};

describe("TokenTypeBars", () => {
  it("renders one bar per token type", () => {
    render(<TokenTypeBars usage={usage} />);

    expect(screen.getAllByTestId(/^bar-/)).toHaveLength(7);
  });

  it("scales bar width proportionally to the largest known value", () => {
    render(<TokenTypeBars usage={usage} />);

    // cacheRead (300) is the largest known value, so it gets the full bar width.
    expect(screen.getByTestId("bar-cacheRead")).toHaveAttribute("width", "80");
    // cacheWrite (150) is half of cacheRead, so its bar is half as wide.
    expect(screen.getByTestId("bar-cacheWrite")).toHaveAttribute("width", "40");
  });

  it("marks an unavailable token type distinctly instead of a zero-width bar", () => {
    render(<TokenTypeBars usage={usage} />);

    expect(screen.getByTestId("bar-reasoning").getAttribute("aria-label")).toMatch(/unavailable/i);
  });
});
