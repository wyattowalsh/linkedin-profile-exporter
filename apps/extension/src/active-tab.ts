import { detectLinkedInProfileReadiness } from "@linkedin-profile-exporter/core/extraction";
import { browser } from "wxt/browser";
import type { RuntimeMessage, RuntimeResponse } from "./messaging";

export async function sendToActiveProfileTab(message: RuntimeMessage): Promise<RuntimeResponse> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { ok: false, error: "No active tab is available." };

  const tabReadiness = detectLinkedInProfileReadiness(tab.url ?? "");
  if (tabReadiness.state === "unavailable") {
    if (message.type === "profile-readiness") return { ok: true, readiness: tabReadiness };
    return { ok: false, error: tabReadiness.reason };
  }

  try {
    return (await browser.tabs.sendMessage(tab.id, message)) as RuntimeResponse;
  } catch {
    return {
      ok: false,
      error: "LinkedIn profile tab is open, but the exporter content script is not available yet. Reload the profile tab, then try again."
    };
  }
}
