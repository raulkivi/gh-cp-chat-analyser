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

function fakeFetch(url: string) {
  if (url === "/api/health") {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: "ok" }) });
  }
  if (url === "/api/learn/scenarios") {
    return Promise.resolve({ ok: true, json: () => Promise.resolve([scenario]) });
  }
  return Promise.reject(new Error(`Unhandled fetch url in test: ${url}`));
}

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(fakeFetch));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a successful health check from the server", async () => {
    render(<App />);

    await waitFor(() =>
      expect(screen.getByText(/status: ok/i)).toBeInTheDocument(),
    );
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
});
