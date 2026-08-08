import { useEffect, useState } from "react";

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
    </main>
  );
}
