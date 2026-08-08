import type { ToolInventoryEntry } from "@gh-cp-chat-analyser/domain";

interface ToolInventoryPanelProps {
  entries: ToolInventoryEntry[];
}

export function ToolInventoryPanel({ entries }: ToolInventoryPanelProps) {
  return (
    <section>
      <h2>Tool inventory</h2>
      {entries.length === 0 ? (
        <p>No tool inventory available for this session.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Tool</th>
              <th>Loaded</th>
              <th>Invoked in turns</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.name}>
                <td>{entry.name}</td>
                <td>{entry.loaded ? "loaded" : "not loaded"}</td>
                <td>
                  {entry.invokedInTurns.length > 0
                    ? entry.invokedInTurns.join(", ")
                    : "never invoked"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
