import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { makeTurn } from "../test-support/turn-fixture.js";
import { TurnsTable } from "./TurnsTable.js";

describe("TurnsTable", () => {
  it("renders one row per turn plus a header row", () => {
    const turns = [makeTurn({ index: 1 }), makeTurn({ index: 2 })];

    render(<TurnsTable turns={turns} selectedTurnIndex={0} onSelectTurn={() => {}} />);

    expect(screen.getAllByRole("row")).toHaveLength(turns.length + 1);
  });

  it("shows 'unavailable' for an unknown token count instead of a number", () => {
    const turns = [
      makeTurn({
        usage: { ...makeTurn().usage, cacheWrite: { known: false, reason: "no data" } },
      }),
    ];

    render(<TurnsTable turns={turns} selectedTurnIndex={0} onSelectTurn={() => {}} />);

    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
  });

  it("calls onSelectTurn with the clicked row's array index", () => {
    const onSelectTurn = vi.fn();
    const turns = [makeTurn({ index: 1 }), makeTurn({ index: 2 })];

    render(<TurnsTable turns={turns} selectedTurnIndex={0} onSelectTurn={onSelectTurn} />);
    const rows = screen.getAllByRole("row");
    fireEvent.click(rows[2]); // header row + turn 0's row + turn 1's row

    expect(onSelectTurn).toHaveBeenCalledWith(1);
  });
});
