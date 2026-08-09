import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeTurn } from "../test-support/turn-fixture.js";
import { TurnsTable } from "./TurnsTable.js";

describe("TurnsTable", () => {
  it("renders the 11-column header spec in order", () => {
    render(<TurnsTable turns={[]} selectedTurnIndex={0} onSelectTurn={() => {}} />);

    const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers).toEqual([
      "Turn",
      "Trigger",
      "Uncached in",
      "Cache read",
      "Cache write",
      "Tool",
      "Vision",
      "Reasoning",
      "Output",
      "AI Credits",
      "Model",
    ]);
  });

  it("renders one row per turn plus a header row", () => {
    const turns = [makeTurn({ index: 1 }), makeTurn({ index: 2 })];

    render(<TurnsTable turns={turns} selectedTurnIndex={0} onSelectTurn={() => {}} />);

    expect(screen.getAllByRole("row")).toHaveLength(turns.length + 1);
  });

  it("shows an em dash for an unknown token count instead of a number or the word 'unavailable'", () => {
    const turns = [
      makeTurn({
        usage: { ...makeTurn().usage, cacheWrite: { known: false, reason: "no data" } },
      }),
    ];

    render(<TurnsTable turns={turns} selectedTurnIndex={0} onSelectTurn={() => {}} />);

    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByText(/unavailable/i)).not.toBeInTheDocument();
  });

  it("renders a trigger tag when triggeredEvent is set, else a muted em dash", () => {
    const turns = [
      makeTurn({ index: 0, triggeredEvent: "compaction" }),
      makeTurn({ index: 1 }),
    ];

    render(<TurnsTable turns={turns} selectedTurnIndex={0} onSelectTurn={() => {}} />);

    expect(screen.getByText("compaction")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("maps each triggeredEvent value to its display label", () => {
    const turns = [
      makeTurn({ index: 0, triggeredEvent: "model-switch" }),
      makeTurn({ index: 1, triggeredEvent: "tool-change" }),
      makeTurn({ index: 2, triggeredEvent: "clear" }),
      makeTurn({ index: 3, triggeredEvent: "rewind" }),
      makeTurn({ index: 4, triggeredEvent: "fork" }),
      makeTurn({ index: 5, triggeredEvent: "cache-expiry" }),
    ];

    render(<TurnsTable turns={turns} selectedTurnIndex={0} onSelectTurn={() => {}} />);

    expect(screen.getByText("model switch")).toBeInTheDocument();
    expect(screen.getByText("tool change")).toBeInTheDocument();
    expect(screen.getByText("/clear")).toBeInTheDocument();
    expect(screen.getByText("/rewind")).toBeInTheDocument();
    expect(screen.getByText("fork")).toBeInTheDocument();
    expect(screen.getByText("cache expiry")).toBeInTheDocument();
  });

  it("renders the turn's model, muted", () => {
    const turns = [makeTurn({ usage: { ...makeTurn().usage, model: "claude-sonnet-5" } })];

    render(<TurnsTable turns={turns} selectedTurnIndex={0} onSelectTurn={() => {}} />);

    expect(screen.getByText("claude-sonnet-5")).toBeInTheDocument();
  });

  it("renders AI Credits without a dollar sign", () => {
    const turns = [
      makeTurn({
        usage: {
          ...makeTurn().usage,
          costAiCredits: { known: true, value: 2.79598 },
        },
      }),
    ];

    render(<TurnsTable turns={turns} selectedTurnIndex={0} onSelectTurn={() => {}} />);

    expect(screen.getByText("2.79598")).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("calls onSelectTurn with the clicked row's array index", () => {
    const onSelectTurn = vi.fn();
    const turns = [makeTurn({ index: 1 }), makeTurn({ index: 2 })];

    render(<TurnsTable turns={turns} selectedTurnIndex={0} onSelectTurn={onSelectTurn} />);
    const rows = screen.getAllByRole("row");
    fireEvent.click(rows[2]); // header row + turn 0's row + turn 1's row

    expect(onSelectTurn).toHaveBeenCalledWith(1);
  });

  it("calls onSelectTurn when a row is activated via Enter/Space keydown", () => {
    const onSelectTurn = vi.fn();
    const turns = [makeTurn({ index: 1 }), makeTurn({ index: 2 })];

    render(<TurnsTable turns={turns} selectedTurnIndex={0} onSelectTurn={onSelectTurn} />);
    const rows = screen.getAllByRole("row");
    fireEvent.keyDown(rows[2], { key: "Enter" });

    expect(onSelectTurn).toHaveBeenCalledWith(1);
  });

  it("marks the selected row via aria-selected", () => {
    const turns = [makeTurn({ index: 1 }), makeTurn({ index: 2 })];

    render(<TurnsTable turns={turns} selectedTurnIndex={1} onSelectTurn={() => {}} />);
    const rows = screen.getAllByRole("row");

    expect(rows[1]).toHaveAttribute("aria-selected", "false");
    expect(rows[2]).toHaveAttribute("aria-selected", "true");
  });
});
