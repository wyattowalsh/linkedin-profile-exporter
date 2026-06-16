import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { profileToDownload } from "../src/export-download";
import type { RuntimeMessage, RuntimeResponse } from "../src/messaging";

export default defineBackground(() => {
  void updateActionStateForActiveTab().catch(reportActionStateError);
  browser.tabs.onActivated.addListener(({ tabId }) => {
    void updateActionStateForTab(tabId).catch(reportActionStateError);
  });
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!tab.active && !changeInfo.url) return;
    void updateActionStateForTab(tabId, tab.url ?? changeInfo.url).catch(reportActionStateError);
  });

  browser.runtime.onMessage.addListener(
    (message: RuntimeMessage): Promise<RuntimeResponse> | undefined => {
      if (message.type !== "download-export") return undefined;
      return profileToDownload(message.profile, message.format, message.filenameTemplate)
        .then((download) =>
          browser.downloads.download({
            url: download.dataUrl,
            filename: download.filename,
            saveAs: false
          })
        )
        .then(() => ({ ok: true as const, downloaded: true as const }))
        .catch((error: unknown) => ({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        }));
    }
  );
});

type ActionDetails = { tabId: number };
type ActionApi = {
  disable?: (tabId?: number) => Promise<void> | void;
  enable?: (tabId?: number) => Promise<void> | void;
  setBadgeBackgroundColor?: (details: ActionDetails & { color: string }) => Promise<void> | void;
  setBadgeTextColor?: (details: ActionDetails & { color: string }) => Promise<void> | void;
  setBadgeText?: (details: ActionDetails & { text: string }) => Promise<void> | void;
  setTitle?: (details: ActionDetails & { title: string }) => Promise<void> | void;
};

async function updateActionStateForActiveTab(): Promise<void> {
  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (typeof activeTab?.id !== "number") return;
  await updateActionStateForTab(activeTab.id, activeTab.url);
}

async function updateActionStateForTab(tabId: number, url?: string): Promise<void> {
  const action = actionApi();
  if (!action) return;

  const tabUrl = url ?? (await tabUrlForActionUpdate(tabId));
  if (tabUrl === null) return;
  const profileActive = isLinkedInProfileUrl(tabUrl);
  try {
    await Promise.all([
      callTabAction(action, profileActive ? "enable" : "disable", tabId),
      callAction(action, "setBadgeText", { tabId, text: profileActive ? "IN" : "" }),
      callAction(action, "setTitle", {
        tabId,
        title: profileActive ? "Export this LinkedIn profile" : "Open a LinkedIn profile to export"
      }),
      callAction(action, "setBadgeBackgroundColor", {
        tabId,
        color: profileActive ? "#0a66c2" : "#66736d"
      }),
      callAction(action, "setBadgeTextColor", {
        tabId,
        color: "#ffffff"
      })
    ]);
  } catch (error) {
    if (!isMissingTabError(error)) throw error;
  }
}

function actionApi(): ActionApi | undefined {
  const extensionBrowser = browser as typeof browser & {
    action?: ActionApi;
    browserAction?: ActionApi;
  };
  return extensionBrowser.action ?? extensionBrowser.browserAction;
}

async function callAction<TDetails extends ActionDetails>(
  action: ActionApi,
  method: "setBadgeBackgroundColor" | "setBadgeText" | "setBadgeTextColor" | "setTitle",
  details: TDetails
): Promise<void> {
  await action[method]?.(details as never);
}

async function callTabAction(
  action: ActionApi,
  method: "disable" | "enable",
  tabId: number
): Promise<void> {
  await action[method]?.(tabId);
}

function isLinkedInProfileUrl(url: string | undefined): boolean {
  return Boolean(url && /^https:\/\/www\.linkedin\.com\/in\/[^/?#]+\/?/i.test(url));
}

async function tabUrlForActionUpdate(tabId: number): Promise<string | undefined | null> {
  try {
    return (await browser.tabs.get(tabId)).url;
  } catch (error) {
    if (isMissingTabError(error)) return null;
    throw error;
  }
}

function reportActionStateError(error: unknown): void {
  if (isMissingTabError(error)) return;
  console.error("Unable to update LinkedIn Profile Exporter action state.", error);
}

function isMissingTabError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /No tab with id:/i.test(message);
}
