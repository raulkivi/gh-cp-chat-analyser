import { existsSync } from "node:fs";
import path from "node:path";
import { resolveUserDataDir } from "../../platform/vscode-paths/resolve-user-data-dir.js";

interface ResolveVscodeSettingsPathOptions {
  platform?: NodeJS.Platform;
  homeDir?: string;
}

export function resolveVscodeSettingsPath(
  options: ResolveVscodeSettingsPathOptions = {},
): string | null {
  const userDataDir = resolveUserDataDir(options);
  if (!userDataDir) {
    return null;
  }

  const settingsPath = path.join(userDataDir, "User", "settings.json");
  return existsSync(settingsPath) ? settingsPath : null;
}
