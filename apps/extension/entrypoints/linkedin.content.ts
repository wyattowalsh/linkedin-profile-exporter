import {
  detectLinkedInProfileReadiness,
  extractProfileFromDocument
} from "@linkedin-profile-exporter/core/extraction";
import { applyProfileSettings, type Settings } from "@linkedin-profile-exporter/core/settings";
import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import type { RuntimeMessage, RuntimeResponse } from "../src/messaging";

export default defineContentScript({
  matches: ["https://www.linkedin.com/in/*"],
  runAt: "document_idle",
  main() {
    browser.runtime.onMessage.addListener((message: RuntimeMessage): Promise<RuntimeResponse> | undefined => {
      if (message.type === "profile-readiness") {
        return Promise.resolve({ ok: true as const, readiness: detectLinkedInProfileReadiness(document) });
      }
      if (message.type === "extract-profile") {
        return prepareAccessibleSections(message.settings)
          .then(() => extractProfileFromDocument(document, { settings: message.settings }))
          .then((profile) => ({ ok: true as const, profile: applyProfileSettings(profile, message.settings) }))
          .catch((error: unknown) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      }
      return undefined;
    });
  }
});

async function prepareAccessibleSections(settings: Settings): Promise<void> {
  if (settings.automationMode === "manual") return;
  if (settings.autoScroll) {
    for (let pass = 0; pass < 3; pass += 1) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await delay(75);
    }
    window.scrollTo(0, 0);
  }
  if (!settings.expandShowMore) return;

  const controls = Array.from(document.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>("button, a"))
    .filter((control) => /show more|see more|more results|show all/i.test(control.textContent ?? ""))
    .slice(0, 20);

  for (const control of controls) {
    control.click();
    await delay(50);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
