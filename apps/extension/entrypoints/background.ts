import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import type {
  DetailSectionItems,
  RecoverableSection,
  RuntimeMessage,
  RuntimeResponse
} from "../src/messaging";

export default defineBackground(() => {
  void updateActionStateForActiveTab().catch(reportActionStateError);
  browser.tabs.onActivated.addListener(({ tabId }) => {
    void updateActionStateForTab(tabId).catch(reportActionStateError);
  });
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!tab.active && !changeInfo.url) return;
    void updateActionStateForTab(tabId, tab.url ?? changeInfo.url).catch(reportActionStateError);
  });
  browser.tabs.onRemoved.addListener((tabId) => {
    actionStateByTabId.delete(tabId);
    deleteDetailTabRecoverySession(tabId);
  });
  addRecoveryMessageListener();
});

function addRecoveryMessageListener(): void {
  const runtime = nativeChromeRuntime();
  if (runtime?.onMessage?.addListener) {
    runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type !== "recover-detail-section-tab") return undefined;
      void recoverDetailSectionInInactiveTab(message)
        .then(sendResponse)
        .catch((error: unknown) =>
          sendResponse({
            ok: false,
            error: `Detail tab failed. ${errorMessage(error)}`
          })
        );
      return true;
    });
    return;
  }

  browser.runtime.onMessage.addListener(((message: RuntimeMessage) => {
    if (message.type !== "recover-detail-section-tab") return undefined;
    return recoverDetailSectionInInactiveTab(message);
  }) as never);
}

type ActionDetails = { tabId: number };
type ActionApi = {
  enable?: (tabId?: number) => Promise<void> | void;
  setBadgeBackgroundColor?: (details: ActionDetails & { color: string }) => Promise<void> | void;
  setBadgeText?: (details: ActionDetails & { text: string }) => Promise<void> | void;
  setTitle?: (details: ActionDetails & { title: string }) => Promise<void> | void;
};
type ActionState = {
  badgeBackgroundColor: string;
  badgeText: string;
  title: string;
};
type ScriptingApi = {
  executeScript?: (details: {
    args?: unknown[];
    files?: string[];
    func?: (...args: never[]) => unknown;
    target: { tabId: number };
    world?: "ISOLATED" | "MAIN";
  }) => Promise<unknown> | unknown;
};
type NativeChromeRuntime = {
  onMessage?: {
    addListener?: (
      listener: (
        message: RuntimeMessage,
        sender: unknown,
        sendResponse: (response: RuntimeResponse) => void
      ) => boolean | undefined
    ) => void;
  };
};
type NativeChromeTabs = {
  create?: (...args: unknown[]) => Promise<BrowserTab> | void;
  get?: (...args: unknown[]) => Promise<BrowserTab> | void;
  reload?: (...args: unknown[]) => Promise<void> | void;
  remove?: (...args: unknown[]) => Promise<void> | void;
  sendMessage?: (...args: unknown[]) => Promise<RuntimeResponse> | void;
  update?: (...args: unknown[]) => Promise<BrowserTab> | void;
};
type BrowserTab = {
  id?: number | undefined;
  status?: string | undefined;
  url?: string | undefined;
};
type DetailTabRecoveryWaiter = {
  cancelled: boolean;
  resolve: (acquired: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
};
type DetailTabRecoverySession = {
  closeTimer?: ReturnType<typeof setTimeout> | undefined;
  tabId: number;
};

const actionStateByTabId = new Map<number, ActionState>();
const DETAIL_TAB_SESSION_IDLE_MS = 250;
const MAX_DETAIL_TAB_RECOVERIES = 1;
let activeDetailTabRecoveries = 0;
const detailTabRecoveryQueue: DetailTabRecoveryWaiter[] = [];
const detailTabRecoverySessions = new Map<string, DetailTabRecoverySession>();

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
  const desiredState = actionStateForProfileUrl(profileActive);
  if (sameActionState(actionStateByTabId.get(tabId), desiredState)) return;

  try {
    await Promise.all([
      callTabAction(action, "enable", tabId),
      callAction(action, "setBadgeText", { tabId, text: desiredState.badgeText }),
      callAction(action, "setTitle", { tabId, title: desiredState.title }),
      callAction(action, "setBadgeBackgroundColor", {
        tabId,
        color: desiredState.badgeBackgroundColor
      })
    ]);
    actionStateByTabId.set(tabId, desiredState);
  } catch (error) {
    if (!isMissingTabError(error)) throw error;
    actionStateByTabId.delete(tabId);
  }
}

function actionStateForProfileUrl(profileActive: boolean): ActionState {
  return {
    badgeBackgroundColor: profileActive ? "#0a66c2" : "#66736d",
    badgeText: profileActive ? "IN" : "",
    title: profileActive ? "Export this LinkedIn profile" : "Open a LinkedIn profile to export"
  };
}

function sameActionState(left: ActionState | undefined, right: ActionState): boolean {
  return Boolean(
    left &&
    left.badgeText === right.badgeText &&
    left.badgeBackgroundColor === right.badgeBackgroundColor &&
    left.title === right.title
  );
}

function actionApi(): ActionApi | undefined {
  const extensionBrowser = browser as typeof browser & {
    action?: ActionApi;
    browserAction?: ActionApi;
  };
  return extensionBrowser.action ?? extensionBrowser.browserAction;
}

function nativeChromeRuntime(): NativeChromeRuntime | undefined {
  return (globalThis as typeof globalThis & { chrome?: { runtime?: NativeChromeRuntime } }).chrome
    ?.runtime;
}

function recoveryTabsApi(): NativeChromeTabs {
  const nativeTabs = (globalThis as typeof globalThis & { chrome?: { tabs?: NativeChromeTabs } })
    .chrome?.tabs;
  return nativeTabs ?? (browser.tabs as unknown as NativeChromeTabs);
}

async function callAction<TDetails extends ActionDetails>(
  action: ActionApi,
  method: "setBadgeBackgroundColor" | "setBadgeText" | "setTitle",
  details: TDetails
): Promise<void> {
  await action[method]?.(details as never);
}

async function callTabAction(action: ActionApi, method: "enable", tabId: number): Promise<void> {
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
  console.error("Action state update failed.", error);
}

function isMissingTabError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /No tab with id:/i.test(message);
}

async function recoverDetailSectionInInactiveTab(
  message: Extract<RuntimeMessage, { type: "recover-detail-section-tab" }>
): Promise<RuntimeResponse> {
  const url = safeLinkedInProfileDetailUrl(message.url);
  if (!url) {
    return {
      ok: false,
      error: "Unsupported detail URL."
    };
  }

  const deadline = Date.now() + Math.max(1_000, message.timeoutMs);
  const acquired = await acquireDetailTabRecoverySlot(clampTimeout(deadline, 10_000, 250));
  if (!acquired) {
    return {
      ok: false,
      error: "Detail queue was busy."
    };
  }

  let sessionKey: string | undefined;
  let tabId: number | undefined;
  try {
    const session = await detailTabRecoverySessionForUrl(url, deadline);
    sessionKey = session.key;
    tabId = session.tabId;
    if (typeof tabId !== "number") {
      return { ok: false, error: "Could not create detail tab." };
    }
    await navigateDetailRecoveryTab(tabId, url, deadline);
    const readyTimeoutMs = usesRenderedDetailRecovery(message.section) ? 1_000 : 4_000;
    let navigationReady = await waitForDetailTabReady(
      tabId,
      url,
      clampTimeout(deadline, readyTimeoutMs, 500)
    ).catch(() => false);
    if (!navigationReady) {
      await updateTab(tabId, { url }, clampTimeout(deadline, 2_000, 500)).catch(() => undefined);
      navigationReady = await waitForDetailTabReady(
        tabId,
        url,
        clampTimeout(deadline, readyTimeoutMs, 500)
      ).catch(() => false);
    }
    if (!navigationReady) {
      return {
        ok: false,
        error: "Detail page did not finish loading."
      };
    }
    const renderedDetail = await recoverRenderedRowsInDetailTab(
      tabId,
      url,
      message,
      deadline
    ).catch(() => undefined);
    if (
      renderedDetail &&
      detailResponseHasSectionData(renderedDetail, message.section, message.targetCount ?? 0)
    ) {
      return renderedDetail;
    }
    await injectDetailRecoveryScripts(tabId, deadline).catch(() => undefined);
    const detail = await sendDetailExtractionWhenReady(tabId, message, deadline);
    if (detailResponseHasSectionData(detail, message.section, message.targetCount ?? 0))
      return detail;
    const rscDetail = await recoverRscLabelsInDetailTab(tabId, url, message, deadline).catch(
      () => undefined
    );
    return richerDetailResponse(rscDetail, detail, message.section) ?? detail;
  } catch (error) {
    return {
      ok: false,
      error: `Detail tab failed. ${errorMessage(error)}`
    };
  } finally {
    const handedOffToQueuedRecovery = releaseDetailTabRecoverySlot();
    if (typeof tabId === "number") {
      if (handedOffToQueuedRecovery) {
        scheduleDetailRecoveryTabClose(sessionKey, tabId);
      } else {
        await closeDetailRecoveryTabSession(sessionKey, tabId);
      }
    }
  }
}

async function detailTabRecoverySessionForUrl(
  url: string,
  deadline: number
): Promise<{ key: string | undefined; tabId: number | undefined }> {
  const key = detailTabRecoverySessionKey(url);
  const existing = key ? detailTabRecoverySessions.get(key) : undefined;
  if (existing) {
    if (existing.closeTimer) {
      clearTimeout(existing.closeTimer);
      existing.closeTimer = undefined;
    }
    const tab = await getTab(existing.tabId, clampTimeout(deadline, 1_000, 250)).catch(
      () => undefined
    );
    if (tab?.id === existing.tabId) return { key, tabId: existing.tabId };
    if (key) detailTabRecoverySessions.delete(key);
  }

  const tab = await createTab({ active: false, url }, clampTimeout(deadline, 4_000, 500));
  const tabId = tab.id;
  if (typeof tabId === "number" && key) {
    detailTabRecoverySessions.set(key, { tabId });
  }
  return { key, tabId };
}

async function navigateDetailRecoveryTab(
  tabId: number,
  url: string,
  deadline: number
): Promise<void> {
  const tab = await getTab(tabId, clampTimeout(deadline, 1_000, 250)).catch(() => undefined);
  if (tab?.url && sameTabUrl(tab.url, url)) return;
  await updateTab(tabId, { url }, clampTimeout(deadline, 2_000, 500)).catch(() => undefined);
}

function scheduleDetailRecoveryTabClose(key: string | undefined, tabId: number): void {
  if (!key) {
    void closeDetailRecoveryTab(tabId);
    return;
  }
  const session = detailTabRecoverySessions.get(key);
  if (!session || session.tabId !== tabId) {
    void closeDetailRecoveryTab(tabId);
    return;
  }
  if (session.closeTimer) clearTimeout(session.closeTimer);
  session.closeTimer = setTimeout(() => {
    const current = detailTabRecoverySessions.get(key);
    if (!current || current.tabId !== tabId) return;
    detailTabRecoverySessions.delete(key);
    void closeDetailRecoveryTab(tabId);
  }, DETAIL_TAB_SESSION_IDLE_MS);
}

async function closeDetailRecoveryTabSession(
  key: string | undefined,
  tabId: number
): Promise<void> {
  if (key) {
    const session = detailTabRecoverySessions.get(key);
    if (session?.tabId === tabId) {
      if (session.closeTimer) clearTimeout(session.closeTimer);
      detailTabRecoverySessions.delete(key);
    }
  }
  await closeDetailRecoveryTab(tabId);
}

function deleteDetailTabRecoverySession(tabId: number): void {
  for (const [key, session] of detailTabRecoverySessions) {
    if (session.tabId !== tabId) continue;
    if (session.closeTimer) clearTimeout(session.closeTimer);
    detailTabRecoverySessions.delete(key);
  }
}

async function closeDetailRecoveryTab(tabId: number): Promise<void> {
  await removeTab(tabId, 1_000).catch(() => undefined);
}

function detailResponseHasSectionData(
  response: RuntimeResponse,
  section: RecoverableSection,
  targetCount = 0
): boolean {
  if (!response.ok || !("detail" in response)) return false;
  const detail = response.detail;
  const domSections = detail.domSections;
  const sectionCount = detailSectionItemCount(domSections, section);
  if (targetCount > 0 && sectionCount > 0) return sectionCount >= targetCount;
  if (targetCount > 0 && usesRenderedDetailRecovery(section)) return false;
  if (section === "skills" || section === "courses") return sectionCount > 20;
  if (detail.payloads.length > 0) return true;
  if (!domSections) return false;
  return sectionCount > 0;
}

function detailSectionItemCount(
  domSections: DetailSectionItems | undefined,
  section: RecoverableSection
): number {
  if (!domSections || typeof domSections !== "object") return 0;
  const sections = domSections as Record<string, unknown>;
  const key =
    section === "licensesCertifications"
      ? "licensesCertifications"
      : section === "honorsAwards"
        ? "honorsAwards"
        : section;
  const items = sections[key];
  return Array.isArray(items) ? items.length : 0;
}

function richerDetailResponse(
  candidate: RuntimeResponse | undefined,
  fallback: RuntimeResponse,
  section: RecoverableSection
): RuntimeResponse | undefined {
  if (!candidate?.ok || !("detail" in candidate)) return undefined;
  if (!fallback.ok || !("detail" in fallback)) return candidate;
  const candidateCount = detailSectionItemCount(candidate.detail.domSections, section);
  const fallbackCount = detailSectionItemCount(fallback.detail.domSections, section);
  return candidateCount > fallbackCount ? candidate : fallback;
}

async function sendDetailExtractionWhenReady(
  tabId: number,
  message: Extract<RuntimeMessage, { type: "recover-detail-section-tab" }>,
  deadline: number
): Promise<RuntimeResponse> {
  let lastError = "Content script did not respond.";
  let lastPartialResponse: RuntimeResponse | undefined;
  while (remainingTime(deadline) > 0) {
    await injectDetailRecoveryScripts(tabId, deadline).catch(() => undefined);
    try {
      const response = (await sendTabMessage(
        tabId,
        {
          type: "extract-detail-section",
          requestId: `detail-tab-${Date.now()}`,
          section: message.section,
          ...(typeof message.targetCount === "number" ? { targetCount: message.targetCount } : {})
        } satisfies RuntimeMessage,
        clampTimeout(deadline, detailExtractionMessageTimeoutMs(message), 500)
      )) as RuntimeResponse;
      if (detailResponseHasSectionData(response, message.section, message.targetCount ?? 0)) {
        return response;
      }
      lastPartialResponse = response;
      lastError = "Partial detail data.";
      if ((message.targetCount ?? 0) <= 0) return response;
      await delay(Math.min(250, Math.max(0, remainingTime(deadline))));
    } catch (error) {
      lastError = errorMessage(error);
      await delay(Math.min(250, Math.max(0, remainingTime(deadline))));
    }
  }
  if (lastPartialResponse) return lastPartialResponse;
  return {
    ok: false,
    error: `Detail recovery timed out. ${lastError}`
  };
}

function usesRenderedDetailRecovery(section: RecoverableSection): boolean {
  return [
    "courses",
    "honorsAwards",
    "languages",
    "licensesCertifications",
    "organizations",
    "patents",
    "publications",
    "skills",
    "testScores",
    "volunteering"
  ].includes(section);
}

function detailExtractionMessageTimeoutMs(
  message: Extract<RuntimeMessage, { type: "recover-detail-section-tab" }>
): number {
  if (message.section === "skills") return Math.min(message.timeoutMs, 8_000);
  return Math.min(message.timeoutMs, 6_500);
}

async function waitForDetailTabReady(
  tabId: number,
  expectedUrl: string,
  timeoutMs: number
): Promise<boolean> {
  const expected = expectedUrl.replace(/\/+$/, "");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tab = await getTab(tabId).catch(() => undefined);
    const current = tab?.url?.replace(/\/+$/, "");
    if (current === expected && tab?.status === "complete") return true;
    await delay(100);
  }
  return false;
}

async function injectDetailRecoveryScripts(tabId: number, deadline?: number): Promise<void> {
  const scripting = (browser as typeof browser & { scripting?: ScriptingApi }).scripting;
  if (!scripting?.executeScript) return;
  const timeoutMs = deadline ? clampTimeout(deadline, 1_500, 250) : 1_500;
  await executeScript(
    {
      files: ["content-scripts/linkedin-rsc-hook.js"],
      target: { tabId },
      world: "MAIN"
    },
    "inject-rsc",
    timeoutMs
  ).catch(() => undefined);
  await executeScript(
    {
      files: ["content-scripts/linkedin.js"],
      target: { tabId }
    },
    "inject-content",
    timeoutMs
  ).catch(() => undefined);
}

async function recoverRscLabelsInDetailTab(
  tabId: number,
  url: string,
  message: Extract<RuntimeMessage, { type: "recover-detail-section-tab" }>,
  deadline: number
): Promise<RuntimeResponse | undefined> {
  if (message.section !== "skills" && message.section !== "courses") return undefined;
  const scripting = (browser as typeof browser & { scripting?: ScriptingApi }).scripting;
  if (!scripting?.executeScript) return undefined;
  await injectDetailRecoveryScripts(tabId, deadline).catch(() => undefined);
  await reloadTab(tabId, clampTimeout(deadline, 1_000, 250)).catch(() => undefined);
  const ready = await waitForDetailTabReady(tabId, url, clampTimeout(deadline, 3_000, 500)).catch(
    () => false
  );
  if (!ready) return undefined;
  await injectDetailRecoveryScripts(tabId, deadline).catch(() => undefined);
  const probeTimeoutMs = clampTimeout(deadline, Math.min(message.timeoutMs, 8_000), 1_000);
  const results = (await executeScript(
    {
      args: [message.section, message.targetCount ?? 0, probeTimeoutMs],
      func: rscDetailLabelsProbe as (...args: never[]) => unknown,
      target: { tabId },
      world: "MAIN"
    },
    "probe-rsc",
    probeTimeoutMs + 500
  )) as Array<{ result?: { labels?: string[] } }> | undefined;
  const labels = results?.[0]?.result?.labels ?? [];
  if (!labels.length) return undefined;
  const domSections =
    message.section === "skills"
      ? { skills: labels.map((name) => ({ name })) }
      : { courses: labels.map((name) => ({ name })) };
  return {
    ok: true,
    detail: {
      diagnostics: [
        {
          code: `coverage.${message.section}.recovered`,
          level: "info",
          message: `${message.section === "skills" ? "Skills" : "Courses"} recovery used rendered LinkedIn pagination with ${labels.length} item labels.`,
          source: "linkedin-rsc-pagination"
        }
      ],
      domSections,
      payloads: []
    }
  };
}

async function recoverRenderedRowsInDetailTab(
  tabId: number,
  expectedUrl: string,
  message: Extract<RuntimeMessage, { type: "recover-detail-section-tab" }>,
  deadline: number
): Promise<RuntimeResponse | undefined> {
  if (!usesRenderedDetailRecovery(message.section)) return undefined;
  const scripting = (browser as typeof browser & { scripting?: ScriptingApi }).scripting;
  if (!scripting?.executeScript) return undefined;
  const results = (await executeScript(
    {
      args: [message.section, message.targetCount ?? 0, expectedUrl],
      func: renderedDetailRowsProbe as (...args: never[]) => unknown,
      target: { tabId }
    },
    "probe-rows",
    clampTimeout(deadline, 2_000, 500)
  )) as
    | Array<{
        result?: Record<string, unknown[]>;
      }>
    | undefined;
  const domSections = results?.[0]?.result as DetailSectionItems | undefined;
  const count = detailSectionItemCount(domSections, message.section);
  if (!domSections || count === 0) return undefined;
  return {
    ok: true,
    detail: {
      diagnostics: [
        {
          code: `coverage.${message.section}.recovered`,
          level: "info",
          message: `${message.section} recovery used rendered inactive detail rows with ${count} items.`,
          source: "linkedin-detail-tab"
        }
      ],
      domSections,
      payloads: []
    }
  };
}

function renderedDetailRowsProbe(
  section: string,
  targetCount: number,
  expectedUrl?: string
): Record<string, unknown[]> {
  if (expectedUrl) {
    try {
      const actual = new URL(location.href);
      const expected = new URL(expectedUrl);
      actual.search = "";
      actual.hash = "";
      expected.search = "";
      expected.hash = "";
      if (actual.toString().replace(/\/+$/, "") !== expected.toString().replace(/\/+$/, ""))
        return {};
    } catch {
      return {};
    }
  }
  const rows = Array.from(document.querySelectorAll<HTMLElement>("main li, [role='main'] li"));
  const rowItems = uniqueRows(
    rows
      .map((row) => ({ label: labelFromDetailRow(row), row }))
      .filter((item) => isLikelyLabel(item.label))
  );
  const boundedRows = targetCount > 0 ? rowItems.slice(0, targetCount) : rowItems;
  if (section === "skills") {
    return {
      skills: boundedRows.map(({ label: name, row }) => {
        const endorsements = endorsementsFromText(row?.textContent ?? "");
        return endorsements === undefined ? { name } : { endorsements, name };
      })
    };
  }
  if (section === "courses") {
    return {
      courses: boundedRows.map(({ label }) => {
        const parsed = courseNumberAndName(label);
        return parsed.number ? parsed : { name: parsed.name };
      })
    };
  }
  if (section === "licensesCertifications") {
    return {
      licensesCertifications: boundedRows.map(({ label, row }) => {
        const lines = detailRowLines(row, label);
        const issuer = firstInformationalLine(lines);
        const date = firstDateLine(lines);
        const credentialId = credentialIdFromText(lines.join(" "));
        const credentialUrl = firstHref(row);
        return compactRecord({
          name: label,
          issuer,
          date,
          credentialId,
          credentialUrl
        });
      })
    };
  }
  if (section === "publications") {
    return {
      publications: boundedRows.map(({ label, row }) => {
        const lines = detailRowLines(row, label);
        return compactRecord({
          name: label,
          publisher: firstInformationalLine(lines),
          date: firstDateLine(lines),
          url: firstHref(row),
          description: firstDescriptionLine(lines),
          authors: authorsFromLines(lines)
        });
      })
    };
  }
  if (section === "volunteering") {
    return {
      volunteering: boundedRows.map(({ label, row }) => {
        const lines = detailRowLines(row, label);
        return compactRecord({
          role: label,
          organization: firstInformationalLine(lines) ?? label,
          organizationUrl: firstHref(row),
          dates: firstDateLine(lines),
          description: firstDescriptionLine(lines)
        });
      })
    };
  }
  if (section === "honorsAwards") {
    return {
      honorsAwards: boundedRows.map(({ label, row }) => {
        const lines = detailRowLines(row, label);
        return compactRecord({
          title: label,
          issuer: firstInformationalLine(lines),
          date: firstDateLine(lines),
          description: firstDescriptionLine(lines)
        });
      })
    };
  }
  if (section === "testScores") {
    return {
      testScores: boundedRows.map(({ label, row }) => {
        const lines = detailRowLines(row, label);
        return compactRecord({
          name: label,
          score: testScoreFromText(lines.join(" ")),
          date: firstDateLine(lines),
          description: firstDescriptionLine(lines)
        });
      })
    };
  }
  if (section === "patents") {
    return {
      patents: boundedRows.map(({ label, row }) => {
        const lines = detailRowLines(row, label);
        const numbers = patentNumbersFromText(lines.join(" "));
        return compactRecord({
          title: label,
          issuer: firstInformationalLine(lines),
          patentNumber: numbers.patentNumber,
          applicationNumber: numbers.applicationNumber,
          date: firstDateLine(lines),
          url: firstHref(row),
          description: firstDescriptionLine(lines)
        });
      })
    };
  }
  if (section === "languages") {
    return {
      languages: boundedRows.map(({ label, row }) =>
        compactRecord({
          language: label,
          fluency: firstInformationalLine(detailRowLines(row, label))
        })
      )
    };
  }
  if (section === "organizations") {
    return {
      organizations: boundedRows.map(({ label, row }) => {
        const lines = detailRowLines(row, label);
        return compactRecord({
          name: label,
          role: firstInformationalLine(lines),
          dates: firstDateLine(lines),
          url: firstHref(row),
          description: firstDescriptionLine(lines)
        });
      })
    };
  }
  return {};

  function detailRowLines(row: HTMLElement, label: string): string[] {
    const labelKey = normalizeTextKey(label);
    return Array.from(row.querySelectorAll<HTMLElement>("span[aria-hidden='true']"))
      .map((element) => cleanText(element.textContent ?? ""))
      .filter((line) => line && normalizeTextKey(line) !== labelKey)
      .filter(isLikelyDetailLine);
  }

  function firstHref(row: HTMLElement): string | undefined {
    const href = row.querySelector<HTMLAnchorElement>("a[href]")?.href;
    return href && !href.startsWith("javascript:") ? href : undefined;
  }

  function firstInformationalLine(lines: string[]): string | undefined {
    return lines.find((line) => {
      if (isDateLine(line)) return false;
      if (/^(?:authors?|credential|patent|application|score)\b/i.test(line)) return false;
      if (line.length > 80) return false;
      return true;
    });
  }

  function firstDescriptionLine(lines: string[]): string | undefined {
    return lines.find((line) => {
      if (isDateLine(line)) return false;
      if (/^(?:authors?|credential|patent|application|score)\b/i.test(line)) return false;
      return line.length > 20;
    });
  }

  function firstDateLine(lines: string[]): string | undefined {
    return lines.find(isDateLine);
  }

  function isDateLine(value: string): boolean {
    return /\b(?:present|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4})\b/i.test(value);
  }

  function credentialIdFromText(value: string): string | undefined {
    return /\bcredential\s+id\s*[:#]?\s*([A-Z0-9._-]+)/i.exec(value)?.[1];
  }

  function patentNumbersFromText(value: string): {
    applicationNumber?: string;
    patentNumber?: string;
  } {
    const patentNumber = /\bpatent\s+(?:number|#)\s*[:#]?\s*([A-Z0-9._-]+)/i.exec(value)?.[1];
    const applicationNumber = /\bapplication\s+(?:number|#)\s*[:#]?\s*([A-Z0-9._-]+)/i.exec(
      value
    )?.[1];
    return {
      ...(patentNumber ? { patentNumber } : {}),
      ...(applicationNumber ? { applicationNumber } : {})
    };
  }

  function testScoreFromText(value: string): string | undefined {
    return /\bscore\s*[:#]?\s*([A-Z0-9./+-]+)/i.exec(value)?.[1];
  }

  function authorsFromLines(lines: string[]): string[] | undefined {
    const authorLine = lines.find((line) => /^authors?\s*[:#]?/i.test(line));
    const authors = authorLine?.replace(/^authors?\s*[:#]?\s*/i, "");
    if (!authors) return undefined;
    const parsed = authors
      .split(/,|\band\b/i)
      .map(cleanText)
      .filter(Boolean);
    return parsed.length ? parsed : undefined;
  }

  function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(record).filter(([, value]) =>
        Array.isArray(value) ? value.length > 0 : value !== undefined && value !== ""
      )
    );
  }

  function isLikelyDetailLine(value: string): boolean {
    if (!value) return false;
    if (/^(show all|show more|view|follow|message|connect)$/i.test(value)) return false;
    return true;
  }

  function normalizeTextKey(value: string): string {
    return cleanText(value).toLowerCase();
  }

  function uniqueRows(values: Array<{ label: string; row: HTMLElement }>): Array<{
    label: string;
    row: HTMLElement;
  }> {
    const seen = new Set<string>();
    const unique: Array<{ label: string; row: HTMLElement }> = [];
    for (const value of values) {
      const key = value.label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(value);
    }
    return unique;
  }

  function labelFromDetailRow(row: HTMLElement): string {
    const candidates = [
      row.querySelector<HTMLElement>(".mr1.t-bold [aria-hidden='true']"),
      row.querySelector<HTMLElement>(".mr1.t-bold"),
      row.querySelector<HTMLElement>("[aria-hidden='true']"),
      row
    ];
    for (const candidate of candidates) {
      const text = cleanText(candidate?.textContent ?? "");
      if (text) return text;
    }
    return "";
  }

  function cleanText(value: string): string {
    return value.replace(/\s+/g, " ").trim();
  }

  function isLikelyLabel(value: string): boolean {
    const text = value.trim();
    if (text.length < 2 || text.length > 160) return false;
    if (
      /^(show all|show more|top skills|skills|courses|licenses|projects|test scores|languages|organizations)$/i.test(
        text
      )
    )
      return false;
    if (/^(associated with|endorsement|endorsed by|view|follow|message|connect)$/i.test(text))
      return false;
    return /[A-Za-z]/.test(text);
  }

  function endorsementsFromText(value: string): number | undefined {
    const match = /\b(\d[\d,]*)\s+endorsements?\b/i.exec(value);
    if (!match?.[1]) return undefined;
    const parsed = Number(match[1].replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function courseNumberAndName(value: string): { name: string; number?: string } {
    const match = /^([A-Z]{2,}[\w.-]*\s?\d[\w.-]*)\s*[-–:]\s*(.+)$/.exec(value);
    const number = match?.[1];
    const name = match?.[2];
    if (!number || !name) return { name: value };
    return {
      name: name.trim(),
      number: number.replace(/\s+/g, " ").trim()
    };
  }
}

function createTab(
  createProperties: Record<string, unknown>,
  timeoutMs = 8_000
): Promise<BrowserTab> {
  const tabs = recoveryTabsApi();
  return callExtensionApi<BrowserTab>(
    "tabs.create",
    timeoutMs,
    tabs.create?.bind(tabs) as (...args: unknown[]) => Promise<BrowserTab> | void,
    createProperties
  );
}

function getTab(tabId: number, timeoutMs = 5_000): Promise<BrowserTab> {
  const tabs = recoveryTabsApi();
  return callExtensionApi<BrowserTab>(
    "tabs.get",
    timeoutMs,
    tabs.get?.bind(tabs) as (...args: unknown[]) => Promise<BrowserTab> | void,
    tabId
  );
}

function updateTab(
  tabId: number,
  updateProperties: Record<string, unknown>,
  timeoutMs = 5_000
): Promise<BrowserTab> {
  const tabs = recoveryTabsApi();
  return callExtensionApi<BrowserTab>(
    "tabs.update",
    timeoutMs,
    tabs.update?.bind(tabs) as (...args: unknown[]) => Promise<BrowserTab> | void,
    tabId,
    updateProperties
  );
}

function removeTab(tabId: number, timeoutMs = 5_000): Promise<void> {
  const tabs = recoveryTabsApi();
  return callExtensionApi<void>(
    "tabs.remove",
    timeoutMs,
    tabs.remove?.bind(tabs) as (...args: unknown[]) => Promise<void> | void,
    tabId
  );
}

function reloadTab(tabId: number, timeoutMs = 5_000): Promise<void> {
  const tabs = recoveryTabsApi();
  return callExtensionApi<void>(
    "tabs.reload",
    timeoutMs,
    tabs.reload?.bind(tabs) as (...args: unknown[]) => Promise<void> | void,
    tabId
  );
}

function sendTabMessage(
  tabId: number,
  message: RuntimeMessage,
  timeoutMs = 8_000
): Promise<RuntimeResponse> {
  const tabs = recoveryTabsApi();
  return callExtensionApi<RuntimeResponse>(
    "tabs.sendMessage",
    timeoutMs,
    tabs.sendMessage?.bind(tabs) as (...args: unknown[]) => Promise<RuntimeResponse> | void,
    tabId,
    message
  );
}

function executeScript(
  details: Parameters<NonNullable<ScriptingApi["executeScript"]>>[0],
  label: string,
  timeoutMs = 8_000
): Promise<unknown> {
  const scripting = (browser as typeof browser & { scripting?: ScriptingApi }).scripting;
  if (!scripting?.executeScript) return Promise.resolve(undefined);
  return callExtensionApi<unknown>(
    label,
    timeoutMs,
    scripting.executeScript.bind(scripting) as (...args: unknown[]) => Promise<unknown> | void,
    details
  );
}

function callExtensionApi<TResult>(
  label: string,
  timeoutMs: number,
  method: (...args: unknown[]) => Promise<TResult> | void,
  ...args: unknown[]
): Promise<TResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value: TResult) => {
      if (settled) return;
      const error = runtimeLastErrorMessage();
      settled = true;
      clearTimeout(timer);
      if (error) reject(new Error(error));
      else resolve(value);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const timer = setTimeout(() => fail(new Error(`${label} timed out.`)), timeoutMs);
    try {
      const maybePromise = method(...args, finish);
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(finish, fail);
      }
    } catch (error) {
      fail(error);
    }
  });
}

function runtimeLastErrorMessage(): string | undefined {
  const extensionBrowser = browser as typeof browser & {
    runtime?: { lastError?: { message?: string } };
  };
  const globalChrome = (
    globalThis as typeof globalThis & {
      chrome?: { runtime?: { lastError?: { message?: string } } };
    }
  ).chrome;
  return extensionBrowser.runtime?.lastError?.message ?? globalChrome?.runtime?.lastError?.message;
}

async function rscDetailLabelsProbe(
  section: "skills" | "courses",
  targetCount: number,
  timeoutMs: number
): Promise<{ labels: string[] }> {
  const requestEvent = "lpe:r";
  const responseEvent = "lpe:s";
  const requestId = crypto.randomUUID();
  const bridgeToken = crypto.randomUUID();
  return await new Promise<{ labels: string[] }>((resolve) => {
    let settled = false;
    const settle = (labels: string[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener(responseEvent, onResponse);
      resolve({ labels });
    };
    const timer = setTimeout(
      () => {
        settle([]);
      },
      Math.max(250, timeoutMs)
    );
    const onResponse = (event: Event) => {
      const detail = (event as CustomEvent).detail as Partial<{
        bridgeToken: string;
        labels: unknown;
        requestId: string;
      }>;
      if (detail.requestId !== requestId) return;
      if (detail.bridgeToken !== bridgeToken) return;
      const labels = detail.labels;
      settle(
        Array.isArray(labels)
          ? labels.filter((label): label is string => typeof label === "string")
          : []
      );
    };
    window.addEventListener(responseEvent, onResponse);
    window.dispatchEvent(
      new CustomEvent(requestEvent, {
        detail: {
          bridgeToken,
          requestId,
          section,
          targetCount,
          timeoutMs
        }
      })
    );
  });
}

async function acquireDetailTabRecoverySlot(timeoutMs: number): Promise<boolean> {
  if (activeDetailTabRecoveries < MAX_DETAIL_TAB_RECOVERIES) {
    activeDetailTabRecoveries += 1;
    return true;
  }
  return new Promise<boolean>((resolve) => {
    const waiter: DetailTabRecoveryWaiter = {
      cancelled: false,
      resolve,
      timer: setTimeout(() => {
        waiter.cancelled = true;
        resolve(false);
      }, timeoutMs)
    };
    detailTabRecoveryQueue.push(waiter);
  });
}

function releaseDetailTabRecoverySlot(): boolean {
  activeDetailTabRecoveries = Math.max(0, activeDetailTabRecoveries - 1);
  while (detailTabRecoveryQueue.length > 0) {
    const waiter = detailTabRecoveryQueue.shift();
    if (!waiter || waiter.cancelled) continue;
    clearTimeout(waiter.timer);
    activeDetailTabRecoveries += 1;
    waiter.resolve(true);
    return true;
  }
  return false;
}

function safeLinkedInProfileDetailUrl(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.origin !== "https://www.linkedin.com") return undefined;
  if (!/^\/in\/[^/]+\/details\/[^/]+\/?$/i.test(url.pathname)) return undefined;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function detailTabRecoverySessionKey(value: string): string | undefined {
  const url = new URL(value);
  const match = /^\/in\/([^/]+)\/details\/[^/]+\/?$/i.exec(url.pathname);
  const profileId = match?.[1];
  return profileId ? safeDecode(profileId).toLowerCase() : undefined;
}

function sameTabUrl(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  return actual.replace(/\/+$/, "") === expected.replace(/\/+$/, "");
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function remainingTime(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

function clampTimeout(deadline: number, preferredMs: number, minimumMs = 0): number {
  const remaining = remainingTime(deadline);
  if (remaining <= 0) return minimumMs;
  return Math.max(minimumMs, Math.min(preferredMs, remaining));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
