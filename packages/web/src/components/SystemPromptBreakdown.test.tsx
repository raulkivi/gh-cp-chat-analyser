import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SystemPromptComponent } from "@gh-cp-chat-analyser/domain";
import { SystemPromptBreakdown } from "./SystemPromptBreakdown.js";

describe("SystemPromptBreakdown", () => {
  it("renders one row per component plus a header row", () => {
    const components: SystemPromptComponent[] = [
      {
        kind: "built-in",
        label: "Base system prompt (100 characters)",
        tokenCount: { known: false, reason: "not broken down" },
      },
      {
        kind: "tool-definitions",
        label: "Tool definitions (4 tools)",
        tokenCount: { known: false, reason: "not broken down" },
      },
    ];

    render(<SystemPromptBreakdown components={components} />);

    expect(screen.getAllByRole("row")).toHaveLength(components.length + 1);
    expect(screen.getByText("Base system prompt (100 characters)")).toBeInTheDocument();
  });

  it("shows 'unavailable' for a component's unknown token count", () => {
    const components: SystemPromptComponent[] = [
      {
        kind: "skill-manifest",
        label: "graphify",
        tokenCount: { known: false, reason: "not broken down" },
      },
    ];

    render(<SystemPromptBreakdown components={components} />);

    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
  });

  it("shows a fallback message when no breakdown is available", () => {
    render(<SystemPromptBreakdown components={[]} />);

    expect(
      screen.getByText(/no system-prompt breakdown available/i),
    ).toBeInTheDocument();
  });
});
