import { useEffect, useState } from "react";
import { DOMAIN_PACKAGE_READY } from "@gh-cp-chat-analyser/domain";

interface HealthResponse {
  status: string;
}

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json() as Promise<HealthResponse>)
      .then(setHealth);
  }, []);

  return (
    <main>
      <h1>GitHub Copilot Chat Session Analyser</h1>
      <p>{health ? `status: ${health.status}` : "Checking server…"}</p>
      {!DOMAIN_PACKAGE_READY && <p role="alert">Domain package unavailable</p>}
    </main>
  );
}
