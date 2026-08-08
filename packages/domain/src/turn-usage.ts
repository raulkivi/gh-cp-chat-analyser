import { z } from "zod";
import { tokenCountSchema } from "./token-count.js";

export const turnUsageSchema = z.object({
  uncachedInput: tokenCountSchema,
  cacheWrite: tokenCountSchema,
  cacheRead: tokenCountSchema,
  tool: tokenCountSchema,
  vision: tokenCountSchema,
  reasoning: tokenCountSchema,
  output: tokenCountSchema,
  costUsd: tokenCountSchema,
  model: z.string(),
});

export type TurnUsage = z.infer<typeof turnUsageSchema>;
