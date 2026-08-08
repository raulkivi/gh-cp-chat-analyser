import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

interface ResolveUserDataDirOptions {
  platform?: NodeJS.Platform;
  homeDir?: string;
}

// Linux only for now; other platforms are a follow-up, not a redesign (architecture §13).
function candidateDirs(platform: NodeJS.Platform, homeDir: string): string[] {
  if (platform !== "linux") {
    return [];
  }
  return [
    path.join(homeDir, ".config", "Code - Insiders"),
    path.join(homeDir, ".config", "Code"),
  ];
}

export function resolveUserDataDir(options: ResolveUserDataDirOptions = {}): string | null {
  const platform = options.platform ?? process.platform;
  const homeDir = options.homeDir ?? homedir();

  for (const candidate of candidateDirs(platform, homeDir)) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}
