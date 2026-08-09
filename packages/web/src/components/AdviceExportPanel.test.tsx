import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@gh-cp-chat-analyser/domain";
import { buildAdviceBundle } from "../lib/build-advice-bundle.js";
import { makeTurn } from "../test-support/turn-fixture.js";
import { AdviceExportPanel } from "./AdviceExportPanel.js";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "s1",
    mode: "analyze",
    title: "Refactor auth module",
    model: "gpt-4o",
    turns: [makeTurn({ index: 0 })],
    turnCount: 1,
    costAiCredits: { known: true, value: 1.5 },
    usageDataAvailable: true,
    ...overrides,
  };
}

describe("AdviceExportPanel", () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when no sessions are selected", () => {
    const { container } = render(<AdviceExportPanel sessions={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the selected session count, pluralized", () => {
    const { rerender } = render(<AdviceExportPanel sessions={[makeSession({ id: "s1" })]} />);
    expect(screen.getByText("1 session selected for advice")).toBeInTheDocument();

    rerender(<AdviceExportPanel sessions={[makeSession({ id: "s1" }), makeSession({ id: "s2" })]} />);
    expect(screen.getByText("2 sessions selected for advice")).toBeInTheDocument();
  });

  it("reveals the generated bundle in a preview when Preview is clicked", () => {
    render(<AdviceExportPanel sessions={[makeSession({ title: "Refactor auth module" })]} />);

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(screen.getByTestId("advice-preview")).toHaveTextContent("Refactor auth module");
  });

  it("excludes tool argsSummary from the preview by default, and includes it once 'Include tool call args' is checked", () => {
    const sessions = [
      makeSession({
        turns: [makeTurn({ index: 0, toolCalls: [{ name: "search_text", argsSummary: "SECRET_SNIPPET" }] })],
      }),
    ];
    render(<AdviceExportPanel sessions={sessions} />);
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(screen.getByTestId("advice-preview")).not.toHaveTextContent("SECRET_SNIPPET");

    fireEvent.click(screen.getByRole("checkbox", { name: /include tool call args/i }));

    expect(screen.getByTestId("advice-preview")).toHaveTextContent("SECRET_SNIPPET");
  });

  it("warns when a selected session hasn't been opened yet, so its turn-level detail is missing", () => {
    const notYetOpened = makeSession({ id: "s1", title: "Not opened", turnCount: 5, turns: [] });
    render(<AdviceExportPanel sessions={[notYetOpened]} />);

    expect(
      screen.getByText(/1 selected session hasn't been opened yet/i),
    ).toBeInTheDocument();
  });

  it("does not warn when every selected session's turns are already loaded", () => {
    render(<AdviceExportPanel sessions={[makeSession({ turnCount: 1, turns: [makeTurn()] })]} />);

    expect(screen.queryByText(/hasn't been opened yet/i)).not.toBeInTheDocument();
  });

  it("copies the generated bundle to the clipboard and shows a confirmation", async () => {
    const sessions = [makeSession()];
    render(<AdviceExportPanel sessions={sessions} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy advice prompt" }));

    expect(writeText).toHaveBeenCalledWith(buildAdviceBundle(sessions, { includeToolArgs: false }));
    expect(await screen.findByText("Copied!")).toBeInTheDocument();
  });
});
