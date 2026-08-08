import { describe, expect, it } from "vitest";
import { configWarningSchema } from "./config-warning.js";

describe("configWarningSchema", () => {
  it("accepts a logging-disabled warning", () => {
    const sample = {
      code: "logging-disabled",
      settingId: "github.copilot.chat.agentDebugLog.fileLogging.enabled",
      currentValue: false,
      recommendedValue: true,
      message: "Usage token logging is disabled.",
      helpSteps: ["Set the setting to true in settings.json", "Reload VS Code"],
    };

    expect(configWarningSchema.parse(sample)).toEqual(sample);
  });

  it("rejects an invalid code", () => {
    const sample = {
      code: "not-a-real-code",
      settingId: "some.setting",
      currentValue: false,
      recommendedValue: true,
      message: "message",
      helpSteps: [],
    };

    expect(() => configWarningSchema.parse(sample)).toThrow();
  });
});
