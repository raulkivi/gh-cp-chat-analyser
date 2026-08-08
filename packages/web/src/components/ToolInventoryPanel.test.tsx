import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ToolInventoryEntry } from "@gh-cp-chat-analyser/domain";
import { ToolInventoryPanel } from "./ToolInventoryPanel.js";

describe("ToolInventoryPanel", () => {
  it("renders the card kicker and each tool's name", () => {
    const entries: ToolInventoryEntry[] = [
      { name: "read_file", loaded: true, invokedInTurns: [0, 1] },
      { name: "create_file", loaded: true, invokedInTurns: [] },
    ];

    render(<ToolInventoryPanel entries={entries} />);

    expect(screen.getByText("Tools: loaded vs. used")).toBeInTheDocument();
    expect(screen.getByText("read_file")).toBeInTheDocument();
    expect(screen.getByText("create_file")).toBeInTheDocument();
  });

  it("distinguishes loaded from not-loaded tools", () => {
    const entries: ToolInventoryEntry[] = [
      { name: "some_new_tool", loaded: false, invokedInTurns: [0] },
    ];

    render(<ToolInventoryPanel entries={entries} />);

    expect(screen.getByText("not loaded")).toBeInTheDocument();
  });

  it("shows 'used in N turns' for an invoked tool and 'not invoked' otherwise", () => {
    const entries: ToolInventoryEntry[] = [
      { name: "read_file", loaded: true, invokedInTurns: [0, 1] },
      { name: "create_file", loaded: true, invokedInTurns: [] },
    ];

    render(<ToolInventoryPanel entries={entries} />);

    expect(screen.getByText("used in 2 turns")).toBeInTheDocument();
    expect(screen.getByText("not invoked")).toBeInTheDocument();
  });

  it("shows a fallback message when no inventory is available", () => {
    render(<ToolInventoryPanel entries={[]} />);

    expect(
      screen.getByText("No tool inventory captured for this session."),
    ).toBeInTheDocument();
  });
});
