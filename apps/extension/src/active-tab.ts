import { detectLinkedInProfileReadiness } from "@linkedin-profile-exporter/core/extraction";
import { browser } from "wxt/browser";
import type { RuntimeMessage, RuntimeResponse } from "./messaging";

type ProfileTargetTab = {
  active?: boolean | undefined;
  id?: number | undefined;
  url?: string | undefined;
  windowId?: number | undefined;
};

export async function sendToActiveProfileTab(message: RuntimeMessage): Promise<RuntimeResponse> {
  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = await profileTabForMessage(activeTab);
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
      error:
        "LinkedIn profile tab is open, but the exporter content script is not available yet. Reload the profile tab, then try again."
    };
  }
}

async function profileTabForMessage(activeTab: ProfileTargetTab | undefined) {
  if (activeTab?.url && !isExtensionPage(activeTab.url)) return activeTab;
  const tabs = await browser.tabs.query({});
  const profileTabs = tabs.filter(
    (tab) => detectLinkedInProfileReadiness(tab.url ?? "").state !== "unavailable"
  );
  return (
    profileTabs.find((tab) => tab.active && tab.windowId === activeTab?.windowId) ??
    profileTabs.find((tab) => tab.active) ??
    profileTabs.find((tab) => tab.windowId === activeTab?.windowId) ??
    profileTabs[0] ??
    activeTab
  );
}

function isExtensionPage(url: string | undefined): boolean {
  return Boolean(url?.startsWith(browser.runtime.getURL("/")));
}
