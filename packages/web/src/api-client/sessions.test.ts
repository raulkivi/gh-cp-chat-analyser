import { describe, expect, it, vi, afterEach } from "vitest";
import type { Session } from "@gh-cp-chat-analyser/domain";
import { fetchSession, fetchSessions } from "./sessions.js";

const sessionSummary = { id: "session-1", mode: "analyze" } as unknown as Session;

describe("sessions api-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the list of sessions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([sessionSummary]),
      }),
    );

    const sessions = await fetchSessions();

    expect(fetch).toHaveBeenCalledWith("/api/sessions");
    expect(sessions).toEqual([sessionSummary]);
  });

  it("fetches a single session by id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sessionSummary),
      }),
    );

    const session = await fetchSession("session-1");

    expect(fetch).toHaveBeenCalledWith("/api/sessions/session-1");
    expect(session).toEqual(sessionSummary);
  });

  it("throws when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );

    await expect(fetchSession("does-not-exist")).rejects.toThrow(/404/);
  });
});
