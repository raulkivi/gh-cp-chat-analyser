import path from "node:path";
import { resolveUserDataDir } from "../../platform/vscode-paths/resolve-user-data-dir.js";

interface ResolveDebugLogsDirPathOptions {
  platform?: NodeJS.Platform;
  homeDir?: string;
}

// Allow-list: must not contain path separators or ".." segments, so a
// session id can never be used to escape the debug-logs directory (§11.2).
const SESSION_ID_PATTERN = /^[a-zA-Z0-9-]+$/;

export function resolveDebugLogsDirPath(
  options: ResolveDebugLogsDirPathOptions = {},
): string | null {
  const userDataDir = resolveUserDataDir(options);
  if (!userDataDir) {
    return null;
  }

  return path.join(
    userDataDir,
    "User",
    "globalStorage",
    "github.copilot-chat",
    "debug-logs",
  );
}

export function isValidSessionId(sessionId: string): boolean {
  return SESSION_ID_PATTERN.test(sessionId);
}

export function resolveMainJsonlPath(
  debugLogsDirPath: string | null,
  sessionId: string,
): string | null {
  if (!debugLogsDirPath || !isValidSessionId(sessionId)) {
    return null;
  }
  return path.join(debugLogsDirPath, sessionId, "main.jsonl");
}
