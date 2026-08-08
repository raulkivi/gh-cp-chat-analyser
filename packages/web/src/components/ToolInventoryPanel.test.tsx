import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ToolInventoryEntry } from "@gh-cp-chat-analyser/domain";
import { ToolInventoryPanel } from "./ToolInventoryPanel.js";

describe("ToolInventoryPanel", () => {
  it("renders one row per tool plus a header row", () => {
    const entries: ToolInventoryEntry[] = [
      { name: "read_file", loaded: true, invokedInTurns: [0, 1] },
      { name: "create_file", loaded: true, invokedInTurns: [] },
    ];

    render(<ToolInventoryPanel entries={entries} />);

    expect(screen.getAllByRole("row")).toHaveLength(entries.length + 1);
  });

  it("distinguishes loaded from not-loaded tools", () => {
    const entries: ToolInventoryEntry[] = [
      { name: "some_new_tool", loaded: false, invokedInTurns: [0] },
    ];

    render(<ToolInventoryPanel entries={entries} />);

    expect(screen.getByText(/not loaded/i)).toBeInTheDocument();
  });

  it("shows 'never invoked' for a loaded tool with no invocations", () => {
    const entries: ToolInventoryEntry[] = [
      { name: "create_file", loaded: true, invokedInTurns: [] },
    ];

    render(<ToolInventoryPanel entries={entries} />);

    expect(screen.getByText(/never invoked/i)).toBeInTheDocument();
  });

  it("shows a fallback message when no inventory is available", () => {
    render(<ToolInventoryPanel entries={[]} />);

    expect(screen.getByText(/no tool inventory available/i)).toBeInTheDocument();
  });
});
