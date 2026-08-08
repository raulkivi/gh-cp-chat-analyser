import { existsSync } from "node:fs";
import path from "node:path";
import { resolveUserDataDir } from "../../platform/vscode-paths/resolve-user-data-dir.js";

interface ResolveSessionStoreDbPathOptions {
  platform?: NodeJS.Platform;
  homeDir?: string;
}

export function resolveSessionStoreDbPath(
  options: ResolveSessionStoreDbPathOptions = {},
): string | null {
  const userDataDir = resolveUserDataDir(options);
  if (!userDataDir) {
    return null;
  }

  const dbPath = path.join(
    userDataDir,
    "User",
    "globalStorage",
    "github.copilot-chat",
    "session-store.db",
  );
  return existsSync(dbPath) ? dbPath : null;
}
