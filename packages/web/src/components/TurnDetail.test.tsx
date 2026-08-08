import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeTurn } from "../test-support/turn-fixture.js";
import { TurnDetail } from "./TurnDetail.js";

describe("TurnDetail", () => {
  it("shows a placeholder when no turn is selected", () => {
    render(<TurnDetail turn={null} />);

    expect(screen.getByText(/no turn selected/i)).toBeInTheDocument();
  });

  it("shows a placeholder when the selected turn made no tool calls", () => {
    render(<TurnDetail turn={makeTurn({ toolCalls: [] })} />);

    expect(screen.getByText(/no tool calls/i)).toBeInTheDocument();
  });

  it("renders one row per tool call, with files touched and token count", () => {
    const turn = makeTurn({
      toolCalls: [
        {
          name: "read_file",
          argsSummary: "src/a.ts",
          filesTouched: ["src/a.ts"],
          tokenCount: { known: false, reason: "not recorded" },
        },
      ],
    });

    render(<TurnDetail turn={turn} />);

    expect(screen.getAllByRole("row")).toHaveLength(2); // header + 1 tool call
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
  });
});
