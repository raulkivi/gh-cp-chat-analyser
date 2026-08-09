import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SystemPromptInspector } from "./SystemPromptInspector.js";

const SAMPLE_TEXT =
  "Intro text.\n<securityRequirements>Follow OWASP.</securityRequirements>\n<skills><skill><name>graphify</name><description>Graph things.</description></skill></skills>";

function stubFetchText(text: string, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok, status, text: () => Promise.resolve(text) }),
  );
}

describe("SystemPromptInspector", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows a loading state, then the parsed menu and raw text once the fetch resolves", async () => {
    stubFetchText(SAMPLE_TEXT);

    render(<SystemPromptInspector sessionId="session-1" onClose={() => {}} />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    expect(await screen.findByRole("button", { name: /security requirements/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /graphify/i })).toBeInTheDocument();
    // The raw-text panel renders adjacent tag-markup/content as sibling text
    // nodes with no per-run element boundary, so assert via the colored
    // section's own container rather than RTL's own-text getByText.
    expect(screen.getByTestId("prompt-node-root.1").textContent).toContain("Follow OWASP.");
  });

  it("shows a not-captured message when the session has no system-prompt artifact", async () => {
    stubFetchText("", false, 404);

    render(<SystemPromptInspector sessionId="session-1" onClose={() => {}} />);

    expect(await screen.findByText(/no system prompt/i)).toBeInTheDocument();
  });

  it("shows a placeholder in the description panel until a section is selected", async () => {
    stubFetchText(SAMPLE_TEXT);
    render(<SystemPromptInspector sessionId="session-1" onClose={() => {}} />);
    await screen.findByRole("button", { name: /security requirements/i });

    expect(screen.getByText(/select a section/i)).toBeInTheDocument();
  });

  it("selecting a menu entry scrolls to and highlights the matching text-panel section, and shows its description", async () => {
    stubFetchText(SAMPLE_TEXT);
    render(<SystemPromptInspector sessionId="session-1" onClose={() => {}} />);
    const menuItem = await screen.findByRole("button", { name: /security requirements/i });

    fireEvent.click(menuItem);

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(screen.getByText(/owasp top 10/i)).toBeInTheDocument();
  });

  it("calls onClose when the close/back control is activated", async () => {
    stubFetchText(SAMPLE_TEXT);
    const onClose = vi.fn();
    render(<SystemPromptInspector sessionId="session-1" onClose={onClose} />);
    await screen.findByRole("button", { name: /security requirements/i });

    fireEvent.click(screen.getByRole("button", { name: /close|back/i }));

    expect(onClose).toHaveBeenCalled();
  });
});
