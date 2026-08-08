import { z } from "zod";

export const tokenCountSchema = z.union([
  z.object({ known: z.literal(true), value: z.number() }),
  z.object({ known: z.literal(false), reason: z.string() }),
]);

export type TokenCount = z.infer<typeof tokenCountSchema>;
