import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";
import { makeTurn } from "./test-support/turn-fixture.js";

const scenario = {
  id: "cache-basics",
  mode: "learn" as const,
  title: "Cache Basics",
  model: "example-model",
  usageDataAvailable: true,
  turns: [
    makeTurn({ index: 1, explanation: "first turn explanation" }),
    makeTurn({ index: 2, explanation: "second turn explanation" }),
  ],
};

const sessionSummary = {
  id: "session-1",
  mode: "analyze" as const,
  title: "Fix the bug",
  model: "unknown",
  usageDataAvailable: false,
  turns: [],
};

const fullSession = {
  ...sessionSummary,
  turns: [
    makeTurn({
      index: 0,
      explanation: "analyze turn explanation",
      toolCalls: [
        {
          name: "read_file",
          argsSummary: "src/a.ts",
          filesTouched: ["src/a.ts"],
          tokenCount: { known: false, reason: "not recorded" },
        },
      ],
    }),
  ],
  systemPrompt: [
    {
      kind: "built-in" as const,
      label: "Base system prompt (100 characters)",
      tokenCount: { known: false, reason: "not broken down" },
    },
  ],
  toolInventory: [
    { name: "read_file", loaded: true, invokedInTurns: [0] },
  ],
};

const cleanConfigStatus = {
  checkedAt: "2026-08-08T00:00:00.000Z",
  vscodeUserSettingsPath: "/home/user/.config/Code/User/settings.json",
  loggingEnabled: true,
  maxRetainedSessionLogs: 200,
  warnings: [],
};

let configStatus = cleanConfigStatus;

function fakeFetch(url: string) {
  if (url === "/api/health") {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ status: "ok", version: "0.1.0" }),
    });
  }
  if (url === "/api/learn/scenarios") {
    return Promise.resolve({ ok: true, json: () => Promise.resolve([scenario]) });
  }
  if (url === "/api/sessions") {
    return Promise.resolve({ ok: true, json: () => Promise.resolve([sessionSummary]) });
  }
  if (url === "/api/sessions/session-1") {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(fullSession) });
  }
  if (url === "/api/config/status") {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(configStatus) });
  }
  return Promise.reject(new Error(`Unhandled fetch url in test: ${url}`));
}

describe("App", () => {
  beforeEach(() => {
    configStatus = cleanConfigStatus;
    vi.stubGlobal("fetch", vi.fn(fakeFetch));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a successful health check from the server, including the app version", async () => {
    render(<App />);

    await waitFor(() =>
      expect(screen.getByText(/status: ok/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/v0\.1\.0/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/health");
  });

  it("lets the user pick a learn scenario and renders the shared layout", async () => {
    render(<App />);

    const scenarioButton = await screen.findByRole("button", { name: "Cache Basics" });
    fireEvent.click(scenarioButton);

    expect(await screen.findByText("first turn explanation")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2 turns
  });

  it("moving the scrubber updates both the turns table selection and the explanation panel", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Cache Basics" }));
    await screen.findByText("first turn explanation");

    fireEvent.change(screen.getByRole("slider"), { target: { value: "1" } });

    expect(await screen.findByText("second turn explanation")).toBeInTheDocument();
    expect(screen.getAllByRole("row")[2]).toHaveAttribute("aria-selected", "true");
  });

  it("lets the user pick a real Analyze session and renders the shared layout", async () => {
    render(<App />);

    const sessionButton = await screen.findByRole("button", { name: "Fix the bug" });
    fireEvent.click(sessionButton);

    expect(await screen.findByText("analyze turn explanation")).toBeInTheDocument();
  });

  it("renders Analyze-mode-only panels (system prompt breakdown, tool inventory, turn detail) for a real session", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Fix the bug" }));
    await screen.findByText("analyze turn explanation");

    expect(
      screen.getByText("Base system prompt (100 characters)"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("read_file").length).toBeGreaterThan(0);
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();
  });

  it("does not render Analyze-mode-only panels for a Learn scenario", async () => {
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Cache Basics" }));
    await screen.findByText("first turn explanation");

    expect(screen.queryByText(/system prompt breakdown/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/tool inventory/i)).not.toBeInTheDocument();
  });

  it("renders the config warning banner when prerequisites aren't met", async () => {
    configStatus = {
      ...cleanConfigStatus,
      loggingEnabled: false,
      maxRetainedSessionLogs: null,
      warnings: [
        {
          code: "retention-too-low",
          settingId: "github.copilot.chat.agentDebugLog.fileLogging.maxRetainedSessionLogs",
          currentValue: 50,
          recommendedValue: 200,
          message: "Only the last 50 sessions' logs are retained on disk.",
          helpSteps: ["Set maxRetainedSessionLogs to 200 in settings.json"],
        },
      ],
    };
    render(<App />);

    expect(
      await screen.findByText("Only the last 50 sessions' logs are retained on disk."),
    ).toBeInTheDocument();
  });
});
