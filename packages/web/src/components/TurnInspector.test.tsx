import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TurnInspectorDetail } from "@gh-cp-chat-analyser/domain";
import { TurnInspector } from "./TurnInspector.js";

const TWO_ROUND_DETAIL: TurnInspectorDetail = {
  turnIndex: 3,
  userMessage: [{ kind: "text", text: "Fix the flaky test." }],
  rounds: [
    {
      request: {
        index: 0,
        addedMessages: [{ kind: "text", text: "system: you are an agent" }],
        toolCalls: [
          {
            name: "read_file",
            args: [{ kind: "text", text: "src/foo.ts" }],
            result: [{ placeholder: true, kind: "file", path: "src/foo.ts", sizeBytes: 14540 }],
          },
        ],
      },
      response: {
        index: 0,
        response: [{ kind: "text", text: "I read the file." }],
        reasoning: [{ kind: "text", text: "Let me check the file first." }],
      },
    },
    {
      request: { index: 1, addedMessages: [{ kind: "text", text: "tool result" }], toolCalls: [] },
      response: { index: 1, response: [{ kind: "text", text: "Done." }] },
    },
  ],
};

function stubFetchJson(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(body) }),
  );
}

describe("TurnInspector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows a loading state, then one card pair per round-trip once the fetch resolves", async () => {
    stubFetchJson(TWO_ROUND_DETAIL);

    render(
      <TurnInspector
        sessionId="session-1"
        turnIndex={3}
        usageDataAvailable={true}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    expect(await screen.findByText("Request · round 0")).toBeInTheDocument();
    expect(screen.getByText("Response · round 0")).toBeInTheDocument();
    expect(screen.getByText("Request · round 1")).toBeInTheDocument();
    expect(screen.getByText("Response · round 1")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/sessions/session-1/turns/3");
  });

  it("shows a header with the turn index, trigger tag, session title, and back button", async () => {
    stubFetchJson(TWO_ROUND_DETAIL);

    render(
      <TurnInspector
        sessionId="session-1"
        turnIndex={3}
        sessionTitle="Phase 9.5 build"
        triggeredEvent="compaction"
        usageDataAvailable={true}
        onClose={() => {}}
      />,
    );
    await screen.findByText("Request · round 0");

    expect(screen.getByText("Phase 9.5 build")).toBeInTheDocument();
    expect(screen.getByText("compaction")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to session/i })).toBeInTheDocument();
  });

  it("renders a placeholder chip (not raw text) for a file placeholder part", async () => {
    stubFetchJson(TWO_ROUND_DETAIL);

    render(
      <TurnInspector sessionId="session-1" turnIndex={3} usageDataAvailable={true} onClose={() => {}} />,
    );
    await screen.findByText("Request · round 0");

    expect(screen.getAllByText(/src\/foo\.ts/).length).toBeGreaterThan(0);
    expect(screen.getByText(/14\.2 KB/)).toBeInTheDocument();
  });

  it("shows reasoning inline under the response when present, with no toggle needed", async () => {
    stubFetchJson(TWO_ROUND_DETAIL);

    render(
      <TurnInspector sessionId="session-1" turnIndex={3} usageDataAvailable={true} onClose={() => {}} />,
    );
    await screen.findByText("Request · round 0");

    expect(screen.getByText("Let me check the file first.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reasoning/i })).not.toBeInTheDocument();
  });

  it("shows the actionable logging-disabled message, without fetching, when the session has no usage data at all", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <TurnInspector sessionId="session-1" turnIndex={0} usageDataAvailable={false} onClose={() => {}} />,
    );

    expect(screen.getByText(/enable agentDebugLog\.fileLogging\.enabled/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows the no-round-trip message when usage data exists but this turn made no request", async () => {
    stubFetchJson({ turnIndex: 0, userMessage: [], rounds: [] });

    render(
      <TurnInspector sessionId="session-1" turnIndex={0} usageDataAvailable={true} onClose={() => {}} />,
    );

    expect(await screen.findByText(/made no request to the model/i)).toBeInTheDocument();
  });

  it("calls onClose when the back button is activated", async () => {
    stubFetchJson(TWO_ROUND_DETAIL);
    const onClose = vi.fn();

    render(
      <TurnInspector sessionId="session-1" turnIndex={3} usageDataAvailable={true} onClose={onClose} />,
    );
    await screen.findByText("Request · round 0");

    fireEvent.click(screen.getByRole("button", { name: /back to session/i }));

    expect(onClose).toHaveBeenCalled();
  });
});
