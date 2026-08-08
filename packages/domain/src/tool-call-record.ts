import { z } from "zod";
import { tokenCountSchema } from "./token-count.js";

export const toolCallRecordSchema = z.object({
  name: z.string(),
  argsSummary: z.string(),
  filesTouched: z.array(z.string()).optional(), // Analyze mode only
  tokenCount: tokenCountSchema.optional(), // Analyze mode only
});

export type ToolCallRecord = z.infer<typeof toolCallRecordSchema>;
