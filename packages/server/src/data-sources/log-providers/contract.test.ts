import type { Session } from "@gh-cp-chat-analyser/domain";
import { describeLogProviderContract } from "./contract.js";
import type { LogProvider, LogProviderAvailability } from "./log-provider.js";

// Proves the shared contract harness's own assertions are correct before
// either concrete provider (VscodeLogProvider, MitmproxyLogProvider) exists
// — a minimal in-memory fake stands in for "any LogProvider" here, per
// phase-9-log-providers-implementation.md §8 step 1.
function buildFakeSession(id: string): Session {
  return {
    id,
    mode: "analyze",
    providerId: "fake",
    title: `Fake session ${id}`,
    model: "unknown",
    turns: [],
    turnCount: 0,
    costAiCredits: { known: false, reason: "fake provider never has usage data" },
    usageDataAvailable: false,
  };
}

class FakeLogProvider implements LogProvider {
  readonly id = "fake";
  readonly label = "Fake";

  constructor(
    private readonly sessions: Session[],
    private readonly availability: LogProviderAvailability,
  ) {}

  async checkAvailability(): Promise<LogProviderAvailability> {
    return this.availability;
  }

  async listSessions(): Promise<Session[]> {
    return this.sessions;
  }

  async readSession(sessionId: string): Promise<Session | null> {
    return this.sessions.find((session) => session.id === sessionId) ?? null;
  }
}

describeLogProviderContract("fake in-memory provider", {
  buildAvailableProvider: () =>
    new FakeLogProvider([buildFakeSession("fake-1")], { available: true }),
  knownSessionId: "fake-1",
  unknownSessionId: "does-not-exist",
  buildUnavailableProvider: () =>
    new FakeLogProvider([], {
      available: false,
      unavailableReason: "Fake source not configured.",
    }),
});
