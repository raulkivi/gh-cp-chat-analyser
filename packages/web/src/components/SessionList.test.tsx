import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Session } from "@gh-cp-chat-analyser/domain";
import { SessionList } from "./SessionList.js";

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "s1",
    mode: "learn",
    title: "Cache write then read",
    model: "gpt-4o",
    turns: [{ index: 0 } as Session["turns"][number], { index: 1 } as Session["turns"][number]],
    turnCount: 2,
    usageDataAvailable: false,
    ...overrides,
  };
}

describe("SessionList", () => {
  it("renders 'Scenarios' as the heading in learn mode and 'Sessions' in analyze mode", () => {
    const { rerender } = render(
      <SessionList mode="learn" sessions={[]} selectedSessionId={null} onSelect={vi.fn()} />,
    );
    expect(screen.getByText("Scenarios")).toBeInTheDocument();

    rerender(<SessionList mode="analyze" sessions={[]} selectedSessionId={null} onSelect={vi.fn()} />);
    expect(screen.getByText("Sessions")).toBeInTheDocument();
  });

  it("renders a card per session with title and turn count", () => {
    const sessions = [makeSession({ id: "s1", title: "First" }), makeSession({ id: "s2", title: "Second" })];
    render(<SessionList mode="learn" sessions={sessions} selectedSessionId={null} onSelect={vi.fn()} />);

    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getAllByText("2 turns")).toHaveLength(2);
  });

  it("renders the card's turn count from turnCount, not turns.length (Analyze-mode summaries omit turn detail)", () => {
    const sessions = [makeSession({ id: "s1", title: "Real session", turns: [], turnCount: 7 })];
    render(<SessionList mode="analyze" sessions={sessions} selectedSessionId={null} onSelect={vi.fn()} />);

    expect(screen.getByText("7 turns")).toBeInTheDocument();
  });

  it("renders the Learn kicker with category when present, falling back to bare 'Learn'", () => {
    const sessions = [
      makeSession({ id: "s1", title: "First", category: "Prompt caching" }),
      makeSession({ id: "s2", title: "Second" }),
    ];
    render(<SessionList mode="learn" sessions={sessions} selectedSessionId={null} onSelect={vi.fn()} />);

    expect(screen.getByText("Learn · Prompt caching")).toBeInTheDocument();
    expect(screen.getByText("Learn")).toBeInTheDocument();
  });

  it("renders the Analyze kicker with relative time when startedAt is present, falling back to bare 'Analyze'", () => {
    const sessions = [
      makeSession({
        id: "s1",
        mode: "analyze",
        title: "First",
        startedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      makeSession({ id: "s2", mode: "analyze", title: "Second" }),
    ];
    render(<SessionList mode="analyze" sessions={sessions} selectedSessionId={null} onSelect={vi.fn()} />);

    expect(screen.getByText("Analyze · 2 days ago")).toBeInTheDocument();
    expect(screen.getByText("Analyze")).toBeInTheDocument();
  });

  it("calls onSelect with the clicked session", () => {
    const onSelect = vi.fn();
    const sessions = [makeSession({ id: "s1", title: "First" })];
    render(<SessionList mode="learn" sessions={sessions} selectedSessionId={null} onSelect={onSelect} />);

    fireEvent.click(screen.getByText("First"));

    expect(onSelect).toHaveBeenCalledWith(sessions[0]);
  });

  it("activates a card via Enter/Space keydown", () => {
    const onSelect = vi.fn();
    const sessions = [makeSession({ id: "s1", title: "First" })];
    render(<SessionList mode="learn" sessions={sessions} selectedSessionId={null} onSelect={onSelect} />);

    fireEvent.keyDown(screen.getByRole("button", { name: /First/ }), { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith(sessions[0]);
  });

  it("filters the list by title via the search input", () => {
    const sessions = [makeSession({ id: "s1", title: "Alpha" }), makeSession({ id: "s2", title: "Beta" })];
    render(<SessionList mode="learn" sessions={sessions} selectedSessionId={null} onSelect={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "alp" } });

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  });

  it("shows 'No matches.' when the search filters out every session", () => {
    const sessions = [makeSession({ id: "s1", title: "Alpha" })];
    render(<SessionList mode="learn" sessions={sessions} selectedSessionId={null} onSelect={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "zzz" } });

    expect(screen.getByText("No matches.")).toBeInTheDocument();
  });
});
