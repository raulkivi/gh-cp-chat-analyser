import type { Session } from "@gh-cp-chat-analyser/domain";

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request to ${url} failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function fetchLearnScenarios(): Promise<Session[]> {
  return getJson<Session[]>("/api/learn/scenarios");
}

export function fetchLearnScenario(id: string): Promise<Session> {
  return getJson<Session>(`/api/learn/scenarios/${id}`);
}
