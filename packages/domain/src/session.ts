import { z } from "zod";
import { systemPromptComponentSchema } from "./system-prompt-component.js";
import { toolInventoryEntrySchema } from "./tool-inventory-entry.js";
import { turnSchema } from "./turn.js";

export const sessionSchema = z.object({
  id: z.string(),
  mode: z.enum(["learn", "analyze"]),
  title: z.string(),
  model: z.string(),
  turns: z.array(turnSchema),
  systemPrompt: z.array(systemPromptComponentSchema).optional(), // Analyze mode only
  toolInventory: z.array(toolInventoryEntrySchema).optional(), // Analyze mode only
  usageDataAvailable: z.boolean(),
});

export type Session = z.infer<typeof sessionSchema>;
