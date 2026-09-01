import { isUserMessage } from "./pi-message.js";
import type { PiRawEntry } from "./pi-jsonl-reader.js";

export interface PiTurnGroup {
  userMessageEntry: PiRawEntry;
  entries: PiRawEntry[];
}

// Groups one branch's linear entry list (session-tree.ts's walkBranch output)
// into turns: everything from a user message up to (not including) the next
// user message belongs to that turn. Directly mirrors
// session-usage-spans.ts's groupEnvelopesByUserMessage, already used for the
// VS Code provider's main.jsonl turn boundaries. Entries before the first
// user message have no turn to belong to and are dropped — this shouldn't
// happen in practice since a real session always opens with a user message
// right after the header.
export function groupBranchEntriesByUserMessage(branchEntries: PiRawEntry[]): PiTurnGroup[] {
  const groups: PiTurnGroup[] = [];

  for (const entry of branchEntries) {
    if (isUserMessage(entry)) {
      groups.push({ userMessageEntry: entry, entries: [entry] });
      continue;
    }
    groups.at(-1)?.entries.push(entry);
  }

  return groups;
}
