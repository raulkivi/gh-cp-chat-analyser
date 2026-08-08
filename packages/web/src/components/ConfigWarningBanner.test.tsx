import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ConfigWarning } from "@gh-cp-chat-analyser/domain";
import { ConfigWarningBanner } from "./ConfigWarningBanner.js";

const warning: ConfigWarning = {
  code: "retention-too-low",
  settingId: "github.copilot.chat.agentDebugLog.fileLogging.maxRetainedSessionLogs",
  currentValue: 50,
  recommendedValue: 200,
  message: "Only the last 50 sessions' logs are retained on disk.",
  helpSteps: ["Set maxRetainedSessionLogs to 200 in settings.json", "Reload VS Code"],
};

describe("ConfigWarningBanner", () => {
  it("renders nothing when there are no warnings", () => {
    render(<ConfigWarningBanner warnings={[]} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders the setting, current vs. recommended value, and fix steps for each warning", () => {
    render(<ConfigWarningBanner warnings={[warning]} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(warning.message)).toBeInTheDocument();
    expect(
      screen.getByText(`${warning.settingId}: current 50, recommended 200`),
    ).toBeInTheDocument();
    for (const step of warning.helpSteps) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
  });
});
