import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeTurn } from "../test-support/turn-fixture.js";
import { CostSparkline } from "./CostSparkline.js";

describe("CostSparkline", () => {
  it("renders a path connecting every turn with a known cost", () => {
    const turns = [
      makeTurn({ index: 0, usage: { ...makeTurn().usage, costAiCredits: { known: true, value: 0.01 } } }),
      makeTurn({ index: 1, usage: { ...makeTurn().usage, costAiCredits: { known: true, value: 0.05 } } }),
      makeTurn({ index: 2, usage: { ...makeTurn().usage, costAiCredits: { known: true, value: 0.02 } } }),
    ];

    render(<CostSparkline turns={turns} />);

    const path = screen.getByTestId("cost-sparkline-path");
    expect(path.getAttribute("d")).toBeTruthy();
    expect(screen.getByRole("img", { name: "AI Credits sparkline" })).toBeInTheDocument();
  });

  it("shows a fallback instead of a path when fewer than two turns have a known cost", () => {
    const turns = [
      makeTurn({ index: 0, usage: { ...makeTurn().usage, costAiCredits: { known: true, value: 0.01 } } }),
      makeTurn({ index: 1, usage: { ...makeTurn().usage, costAiCredits: { known: false, reason: "no data" } } }),
    ];

    render(<CostSparkline turns={turns} />);

    expect(screen.getByTestId("cost-sparkline-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("cost-sparkline-path")).not.toBeInTheDocument();
  });
});
