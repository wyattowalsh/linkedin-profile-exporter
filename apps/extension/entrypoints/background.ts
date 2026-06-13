import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { profileToDownload } from "../src/export-download";
import type { RuntimeMessage, RuntimeResponse } from "../src/messaging";

export default defineBackground(() => {
  void updateActionStateForActiveTab();
  browser.tabs.onActivated.addListener(({ tabId }) => {
    void updateActionStateForTab(tabId);
  });
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!tab.active && !changeInfo.url) return;
    void updateActionStateForTab(tabId, tab.url ?? changeInfo.url);
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

  const tabUrl =
    url ??
    (await browser.tabs
      .get(tabId)
      .then((tab) => tab.url)
      .catch(() => undefined));
  const profileActive = isLinkedInProfileUrl(tabUrl);
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
    })
  ]);
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
  method: "setBadgeBackgroundColor" | "setBadgeText" | "setTitle",
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
