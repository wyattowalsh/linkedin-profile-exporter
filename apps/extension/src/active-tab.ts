import { detectLinkedInProfileReadiness } from "@linkedin-profile-exporter/core/extraction";
import { browser } from "wxt/browser";
import type { RuntimeMessage, RuntimeResponse } from "./messaging";

type ProfileTargetTab = {
  active?: boolean | undefined;
  id?: number | undefined;
  lastAccessed?: number | undefined;
  url?: string | undefined;
  windowId?: number | undefined;
};

const PROFILE_READINESS_MESSAGE_TIMEOUT_MS = 1_500;

export async function sendToActiveProfileTab(message: RuntimeMessage): Promise<RuntimeResponse> {
  const tab = await currentProfileTabForExtensionContext();
  if (!tab?.id) return { ok: false, error: "No active tab is available." };

  const tabReadiness = detectLinkedInProfileReadiness(tab.url ?? "");
  if (tabReadiness.state === "unavailable") {
    if (message.type === "profile-readiness") return { ok: true, readiness: tabReadiness };
    return { ok: false, error: tabReadiness.reason };
  }

  try {
    return await sendProfileTabMessage(tab.id, message);
  } catch (error) {
    if (!isMissingReceiverError(error)) return { ok: false, error: errorMessage(error) };
  }

  const recovery = await injectLinkedInContentScript(tab.id);
  if (!recovery.ok) return recovery;
  await delay(0);

  try {
    return await sendProfileTabMessage(tab.id, message);
  } catch (error) {
    return {
      ok: false,
      error: `The exporter could not connect to the LinkedIn profile tab after runtime recovery. ${errorMessage(error)}`
    };
  }
}

async function sendProfileTabMessage(
  tabId: number,
  message: RuntimeMessage
): Promise<RuntimeResponse> {
  const responsePromise = browser.tabs.sendMessage(tabId, message) as Promise<RuntimeResponse>;
  if (message.type !== "profile-readiness") return responsePromise;
  return withTimeout(
    responsePromise,
    PROFILE_READINESS_MESSAGE_TIMEOUT_MS,
    "Profile readiness message timed out."
  );
}

export async function currentProfileTabForExtensionContext(): Promise<
  ProfileTargetTab | undefined
> {
  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
  return profileTabForMessage(activeTab);
}

async function profileTabForMessage(activeTab: ProfileTargetTab | undefined) {
  if (activeTab?.url && !isExtensionPage(activeTab.url)) return activeTab;
  const tabs = await browser.tabs.query({});
  const profileTabs = tabs.filter(
    (tab) => detectLinkedInProfileReadiness(tab.url ?? "").state !== "unavailable"
  );
  return bestProfileTab(profileTabs, activeTab) ?? activeTab;
}

function bestProfileTab(
  profileTabs: ProfileTargetTab[],
  activeTab: ProfileTargetTab | undefined
): ProfileTargetTab | undefined {
  return [...profileTabs].sort((left, right) => {
    const leftRank = profileTabRank(left, activeTab);
    const rightRank = profileTabRank(right, activeTab);
    if (leftRank !== rightRank) return rightRank - leftRank;
    return (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0) || (right.id ?? 0) - (left.id ?? 0);
  })[0];
}

function profileTabRank(tab: ProfileTargetTab, activeTab: ProfileTargetTab | undefined): number {
  let rank = 0;
  if (activeTab?.windowId !== undefined && tab.windowId === activeTab.windowId) rank += 20;
  if (tab.active) rank += 10;
  return rank;
}

function isExtensionPage(url: string | undefined): boolean {
  return Boolean(url?.startsWith(browser.runtime.getURL("/")));
}

async function injectLinkedInContentScript(
  tabId: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  const file = linkedinContentScriptFile();
  const extensionBrowser = browser as typeof browser & {
    scripting?: {
      executeScript?: (details: {
        files: string[];
        target: { tabId: number };
      }) => Promise<unknown> | void;
    };
    tabs: typeof browser.tabs & {
      executeScript?: (tabId: number, details: { file: string }) => Promise<unknown> | void;
    };
  };

  try {
    if (extensionBrowser.scripting?.executeScript) {
      await extensionBrowser.scripting.executeScript({
        target: { tabId },
        files: [file]
      });
      return { ok: true };
    }
    if (extensionBrowser.tabs.executeScript) {
      await extensionBrowser.tabs.executeScript(tabId, { file });
      return { ok: true };
    }
  } catch (error) {
    return {
      ok: false,
      error: `The exporter could not recover the LinkedIn profile tab connection. ${errorMessage(error)}`
    };
  }

  return {
    ok: false,
    error:
      "This browser target does not expose runtime content-script recovery for the current profile tab."
  };
}

function linkedinContentScriptFile(): string {
  const manifest = browser.runtime.getManifest() as {
    content_scripts?: Array<{ js?: string[]; matches?: string[] }>;
  };
  const linkedInScripts =
    manifest.content_scripts?.filter((entry) =>
      entry.matches?.some((match) => /^https:\/\/www\.linkedin\.com\/in\//i.test(match))
    ) ?? [];
  const file = linkedInScripts
    .flatMap((entry) => entry.js ?? [])
    .find((script) => script.replace(/^\/+/, "") === "content-scripts/linkedin.js");
  return file?.replace(/^\/+/, "") || "content-scripts/linkedin.js";
}

function isMissingReceiverError(error: unknown): boolean {
  return /Could not establish connection|Receiving end does not exist|No matching message handler|message channel closed before a response was received|asynchronous response|timed out/i.test(
    errorMessage(error)
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
