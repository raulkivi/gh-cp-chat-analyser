import { readFileSync } from "node:fs";
import { parse as parseJsonc } from "jsonc-parser";

// Deprecated alias, still honored by VS Code (architecture.md §7).
const LOGGING_ENABLED_SETTING_ID =
  "github.copilot.chat.agentDebugLog.fileLogging.enabled";
const LOGGING_ENABLED_SETTING_ID_DEPRECATED =
  "github.copilot.chat.agentDebugLog.enabled";
const MAX_RETAINED_SESSION_LOGS_SETTING_ID =
  "github.copilot.chat.agentDebugLog.fileLogging.maxRetainedSessionLogs";

export interface VscodeSettingsSnapshot {
  loggingEnabled: boolean;
  maxRetainedSessionLogs: number | null;
}

export function readVscodeSettings(
  settingsPath: string | null,
): VscodeSettingsSnapshot {
  if (!settingsPath) {
    return { loggingEnabled: false, maxRetainedSessionLogs: null };
  }

  const raw = readFileSync(settingsPath, "utf8");
  const settings = (parseJsonc(raw) ?? {}) as Record<string, unknown>;

  const loggingEnabled =
    settings[LOGGING_ENABLED_SETTING_ID] === true ||
    settings[LOGGING_ENABLED_SETTING_ID_DEPRECATED] === true;

  const maxRetainedRaw = settings[MAX_RETAINED_SESSION_LOGS_SETTING_ID];
  const maxRetainedSessionLogs =
    typeof maxRetainedRaw === "number" ? maxRetainedRaw : null;

  return { loggingEnabled, maxRetainedSessionLogs };
}
