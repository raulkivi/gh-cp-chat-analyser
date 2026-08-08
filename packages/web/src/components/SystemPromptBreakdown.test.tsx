import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SystemPromptComponent } from "@gh-cp-chat-analyser/domain";
import { SystemPromptBreakdown } from "./SystemPromptBreakdown.js";

describe("SystemPromptBreakdown", () => {
  it("renders the card kicker and one meter row per component", () => {
    const components: SystemPromptComponent[] = [
      { kind: "built-in", label: "Base system prompt (100 characters)", tokenCount: { known: true, value: 500 } },
      { kind: "tool-definitions", label: "Tool definitions (4 tools)", tokenCount: { known: true, value: 250 } },
    ];

    render(<SystemPromptBreakdown components={components} />);

    expect(screen.getByText("System prompt breakdown")).toBeInTheDocument();
    expect(screen.getByText("Base system prompt (100 characters)")).toBeInTheDocument();
    expect(screen.getByText("Tool definitions (4 tools)")).toBeInTheDocument();
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(screen.getByText("250")).toBeInTheDocument();
  });

  it("sizes each bar proportionally to the largest component's known token count", () => {
    const components: SystemPromptComponent[] = [
      { kind: "built-in", label: "Big", tokenCount: { known: true, value: 1000 } },
      { kind: "tool-definitions", label: "Small", tokenCount: { known: true, value: 250 } },
    ];

    render(<SystemPromptBreakdown components={components} />);

    expect(screen.getByTestId("prompt-bar-fill-Big")).toHaveStyle({ width: "100%" });
    expect(screen.getByTestId("prompt-bar-fill-Small")).toHaveStyle({ width: "25%" });
  });

  it("shows an em dash and an empty bar for a component's unknown token count", () => {
    const components: SystemPromptComponent[] = [
      { kind: "skill-manifest", label: "graphify", tokenCount: { known: false, reason: "not broken down" } },
    ];

    render(<SystemPromptBreakdown components={components} />);

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByTestId("prompt-bar-fill-graphify")).toHaveStyle({ width: "0%" });
  });

  it("shows a fallback message when no breakdown is available", () => {
    render(<SystemPromptBreakdown components={[]} />);

    expect(
      screen.getByText(
        "No prompt artifacts captured for this session — enable agentDebugLog.fileLogging.enabled and reload VS Code.",
      ),
    ).toBeInTheDocument();
  });
});
