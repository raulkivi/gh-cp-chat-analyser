import type { ConfigWarning } from "@gh-cp-chat-analyser/domain";

interface ConfigWarningBannerProps {
  warnings: ConfigWarning[];
}

export function ConfigWarningBanner({ warnings }: ConfigWarningBannerProps) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <div role="alert">
      {warnings.map((warning) => (
        <section key={warning.code}>
          <p>{warning.message}</p>
          <p>
            {warning.settingId}: current {String(warning.currentValue)}, recommended{" "}
            {String(warning.recommendedValue)}
          </p>
          <ol>
            {warning.helpSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
