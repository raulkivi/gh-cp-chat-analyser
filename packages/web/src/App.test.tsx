import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: "ok" }),
      }),
    );
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
});
