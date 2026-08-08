import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "./AppHeader.js";

describe("AppHeader", () => {
  it("renders the wordmark and caption", () => {
    render(
      <AppHeader mode="learn" onModeChange={vi.fn()} hasConfigWarnings={false} onConfigClick={vi.fn()} />,
    );

    expect(screen.getByText("Session Analyser")).toBeInTheDocument();
    expect(screen.getByText("GitHub Copilot Chat")).toBeInTheDocument();
  });

  it("renders a Learn/Analyze mode switch reflecting the current mode", () => {
    render(
      <AppHeader mode="analyze" onModeChange={vi.fn()} hasConfigWarnings={false} onConfigClick={vi.fn()} />,
    );

    expect(screen.getByLabelText("Analyze")).toBeChecked();
    expect(screen.getByLabelText("Learn")).not.toBeChecked();
  });

  it("calls onModeChange when a different mode is selected", () => {
    const onModeChange = vi.fn();
    render(
      <AppHeader mode="learn" onModeChange={onModeChange} hasConfigWarnings={false} onConfigClick={vi.fn()} />,
    );

    fireEvent.click(screen.getByLabelText("Analyze"));

    expect(onModeChange).toHaveBeenCalledWith("analyze");
  });

  it("renders a clickable Config button when there are warnings", () => {
    const onConfigClick = vi.fn();
    render(
      <AppHeader mode="learn" onModeChange={vi.fn()} hasConfigWarnings={true} onConfigClick={onConfigClick} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Config" }));

    expect(onConfigClick).toHaveBeenCalledTimes(1);
  });

  it("renders a static 'Config ✓' tag with no button when there are no warnings", () => {
    render(
      <AppHeader mode="learn" onModeChange={vi.fn()} hasConfigWarnings={false} onConfigClick={vi.fn()} />,
    );

    expect(screen.getByText("Config ✓")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Config" })).not.toBeInTheDocument();
  });
});
