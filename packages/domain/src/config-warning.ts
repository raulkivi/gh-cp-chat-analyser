import { z } from "zod";

export const configWarningSchema = z.object({
  code: z.enum(["logging-disabled", "retention-too-low", "settings-not-found"]),
  settingId: z.string(),
  currentValue: z.unknown(),
  recommendedValue: z.unknown(),
  message: z.string(),
  helpSteps: z.array(z.string()),
});

export type ConfigWarning = z.infer<typeof configWarningSchema>;
