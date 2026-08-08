import type { ConfigStatus } from "@gh-cp-chat-analyser/domain";

export async function fetchConfigStatus(): Promise<ConfigStatus> {
  const response = await fetch("/api/config/status");
  if (!response.ok) {
    throw new Error(`Request to /api/config/status failed with status ${response.status}`);
  }
  return response.json() as Promise<ConfigStatus>;
}
