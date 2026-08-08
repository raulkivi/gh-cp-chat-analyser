import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeTurn } from "../test-support/turn-fixture.js";
import { ExplanationPanel } from "./ExplanationPanel.js";

describe("ExplanationPanel", () => {
  it("renders the explanation for the given turn", () => {
    render(<ExplanationPanel turn={makeTurn({ explanation: "why this happened" })} />);

    expect(screen.getByText("why this happened")).toBeInTheDocument();
  });

  it("renders a placeholder when no turn is selected", () => {
    render(<ExplanationPanel turn={null} />);

    expect(screen.getByText(/no turn selected/i)).toBeInTheDocument();
  });
});
