import { defineContentScript } from "wxt/utils/define-content-script";

const RSC_EVENT = "linkedin-profile-exporter:rsc-pagination";
const RSC_MESSAGE_SOURCE = "linkedin-profile-exporter";
const RSC_MESSAGE_TYPE = "rsc-pagination";
const RSC_HOOK_SENTINEL = "__linkedinProfileExporterRscHookReady";
const RSC_FETCH_SENTINEL = "__linkedinProfileExporterRscFetchWrapped";
const RSC_CAPTURE_COUNT = "__linkedinProfileExporterRscCaptureCount";
const RSC_CAPTURE_LAST_BYTES = "__linkedinProfileExporterRscCaptureLastBytes";
const RSC_RECOVERY_REQUEST_EVENT = "lpe:r";
const RSC_RECOVERY_RESPONSE_EVENT = "lpe:s";
const RSC_REWRAP_TIMER = "__linkedinProfileExporterRscRewrapTimer";
const RSC_REWRAP_STARTED = "__linkedinProfileExporterRscRewrapStarted";
const RSC_REWRAP_WINDOW_MS = 30_000;
const RSC_REWRAP_INTERVAL_MS = 250;
const RSC_REPLAY_HEADER_ALLOWLIST = new Set([
  "accept",
  "content-type",
  "csrf-token",
  "x-requested-with",
  "x-restli-protocol-version"
]);

type RscSection = "skills" | "courses";

type RscReplaySeed = {
  body: Record<string, unknown>;
  headers: Record<string, string>;
  url: string;
};

type RscHookState = {
  captureCount: number;
  labels: string[];
  lastBytes: number;
  recoveryRequests: Set<string>;
  seed?: RscReplaySeed;
};

type RscRuntime = typeof window & {
  [RSC_CAPTURE_COUNT]?: number;
  [RSC_CAPTURE_LAST_BYTES]?: number;
  [RSC_FETCH_SENTINEL]?: boolean;
  [RSC_HOOK_SENTINEL]?: boolean;
  [RSC_REWRAP_STARTED]?: number;
  [RSC_REWRAP_TIMER]?: number;
  fetch: typeof window.fetch & { [RSC_FETCH_SENTINEL]?: boolean };
};

export default defineContentScript({
  matches: ["https://www.linkedin.com/in/*"],
  runAt: "document_start",
  world: "MAIN",
  main() {
    const runtime = window as RscRuntime;
    if (runtime[RSC_HOOK_SENTINEL]) return;
    defineRuntimeFlag(runtime, RSC_HOOK_SENTINEL, true);
    const state: RscHookState = {
      captureCount: 0,
      labels: [],
      lastBytes: 0,
      recoveryRequests: new Set()
    };
    installFetchCapture(runtime, state);
    installRscRecoveryBridge(state);
    startRewrapWindow(runtime, state);
  }
});

function startRewrapWindow(runtime: RscRuntime, state: RscHookState): void {
  if (runtime[RSC_REWRAP_TIMER]) return;
  defineRuntimeFlag(runtime, RSC_REWRAP_STARTED, Date.now());
  runtime[RSC_REWRAP_TIMER] = window.setInterval(() => {
    installFetchCapture(runtime, state);
    if (Date.now() - (runtime[RSC_REWRAP_STARTED] ?? Date.now()) <= RSC_REWRAP_WINDOW_MS) {
      return;
    }
    if (runtime[RSC_REWRAP_TIMER]) {
      window.clearInterval(runtime[RSC_REWRAP_TIMER]);
      delete runtime[RSC_REWRAP_TIMER];
    }
  }, RSC_REWRAP_INTERVAL_MS);
  window.addEventListener("pageshow", () => installFetchCapture(runtime, state));
  window.addEventListener("focus", () => installFetchCapture(runtime, state));
}

function installFetchCapture(runtime: RscRuntime, state: RscHookState): void {
  if (runtime.fetch?.[RSC_FETCH_SENTINEL]) return;
  const originalFetch = window.fetch.bind(window);
  const wrappedFetch = async (...args: Parameters<typeof fetch>) => {
    const response = await originalFetch(...args);
    try {
      const requestUrl = requestUrlFromFetchArgs(args);
      if (!requestUrl.includes("/flagship-web/rsc-action/actions/pagination")) {
        return response;
      }
      const requestBody = requestBodyFromFetchArgs(args);
      const requestHeaders = replayHeadersFromFetchArgs(args);
      void response
        .clone()
        .text()
        .then((responseText) => {
          const labels = labelsFromRscText(responseText);
          const detail = {
            labels,
            responseBytes: responseText.length,
            sections: sectionsFromRscCapture(requestBody, responseText),
            status: response.status,
            type: "pagination" as const
          };
          state.captureCount += 1;
          state.lastBytes = responseText.length;
          mergeLabelsInto(state.labels, labels);
          defineRuntimeFlag(runtime, RSC_CAPTURE_COUNT, state.captureCount);
          defineRuntimeFlag(runtime, RSC_CAPTURE_LAST_BYTES, state.lastBytes);
          const parsedBody = parseJsonRecord(requestBody);
          if (parsedBody)
            state.seed = { body: parsedBody, headers: requestHeaders, url: requestUrl };
          publishCapture(detail);
          window.setTimeout(() => publishCapture(detail), 250);
          window.setTimeout(() => publishCapture(detail), 1_000);
          window.setTimeout(() => publishCapture(detail), 3_000);
        })
        .catch(() => undefined);
    } catch {
      // Capture is best-effort; never interfere with LinkedIn's own request.
    }
    return response;
  };
  Object.defineProperty(wrappedFetch, RSC_FETCH_SENTINEL, { value: true });
  window.fetch = wrappedFetch;
}

function installRscRecoveryBridge(state: RscHookState): void {
  window.addEventListener(RSC_RECOVERY_REQUEST_EVENT, (event) => {
    const detail = (event as CustomEvent).detail as Partial<{
      bridgeToken: string;
      requestId: string;
      section: RscSection;
      targetCount: number;
      timeoutMs: number;
    }>;
    if (
      typeof detail.bridgeToken !== "string" ||
      detail.bridgeToken.length < 16 ||
      typeof detail.requestId !== "string" ||
      state.recoveryRequests.has(detail.requestId) ||
      (detail.section !== "skills" && detail.section !== "courses")
    ) {
      return;
    }
    state.recoveryRequests.add(detail.requestId);
    const requestId = detail.requestId;
    const bridgeToken = detail.bridgeToken;
    const targetCount = typeof detail.targetCount === "number" ? detail.targetCount : 0;
    const timeoutMs = typeof detail.timeoutMs === "number" ? detail.timeoutMs : 0;
    void recoverRscLabels(state, detail.section, targetCount, timeoutMs)
      .then(({ labels }) => publishRecoveryResponse(requestId, bridgeToken, labels))
      .catch(() => publishRecoveryResponse(requestId, bridgeToken, []))
      .finally(() => {
        window.setTimeout(() => state.recoveryRequests.delete(requestId), 30_000);
      });
  });
}

async function recoverRscLabels(
  state: RscHookState,
  section: "skills" | "courses",
  targetCount: number,
  timeoutMs: number
): Promise<{ labels: string[] }> {
  const labels: string[] = [];
  mergeLabelsInto(labels, state.labels);
  const started = Date.now();
  let lastActivationAt = 0;
  let seed = seedFromState(state);
  const rewrapTimer = window.setInterval(
    () => installFetchCapture(window as RscRuntime, state),
    200
  );
  const scrollTimer = window.setInterval(() => {
    installFetchCapture(window as RscRuntime, state);
    if (Date.now() - lastActivationAt > 1_000) {
      lastActivationAt = Date.now();
      activateSectionPagination(section);
    }
    scrollDetailPage();
  }, 250);

  try {
    activateSectionPagination(section);
    while (Date.now() - started < timeoutMs && !seed) {
      installFetchCapture(window as RscRuntime, state);
      mergeLabelsInto(labels, state.labels);
      seed = seedFromState(state);
      if (seed) break;
      await sleep(250);
    }
    if (seed) {
      const pageSize =
        numericAt(seed.body, ["clientArguments", "payload", "count"]) ??
        numericAt(seed.body, ["paginationRequest", "requestedArguments", "payload", "count"]) ??
        10;
      const maxItems = Math.max(targetCount || 0, section === "skills" ? 120 : 60);
      const seenStarts = new Set<number>();
      for (
        let start = pageSize;
        start < maxItems && Date.now() - started < timeoutMs;
        start += pageSize
      ) {
        if (seenStarts.has(start)) break;
        seenStarts.add(start);
        const before = labels.length;
        const remainingMs = Math.max(1, timeoutMs - (Date.now() - started));
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), remainingMs);
        try {
          const response = await window.fetch(seed.url, {
            body: JSON.stringify(withStart(seed.body, start)),
            credentials: "include",
            headers: replayHeaders(seed.headers),
            method: "POST",
            signal: controller.signal
          });
          if (!response.ok) break;
          mergeLabelsInto(labels, labelsFromSectionRscText(await response.text(), section));
          if (labels.length <= before) break;
          if (targetCount > 0 && labels.length >= targetCount) break;
        } catch {
          break;
        } finally {
          window.clearTimeout(timer);
        }
      }
    }
  } finally {
    window.clearInterval(rewrapTimer);
    window.clearInterval(scrollTimer);
  }

  const filtered = labels.filter(isLikelyLabel);
  return { labels: targetCount > 0 ? filtered.slice(0, targetCount) : filtered };
}

function seedFromState(state: RscHookState): RscReplaySeed | undefined {
  const seed = state.seed;
  if (!seed?.url || !seed.body) return undefined;
  return { body: seed.body, headers: seed.headers, url: seed.url };
}

function activateSectionPagination(section: "skills" | "courses"): void {
  if (section !== "skills") return;
  const controls = Array.from(
    document.querySelectorAll<HTMLElement>('button, a, [role="button"], [role="tab"]')
  );
  const control = controls.find((candidate) => {
    const text = (candidate.textContent ?? "").replace(/\s+/g, " ").trim();
    const aria = candidate.getAttribute("aria-label") ?? "";
    return /^All$/i.test(text) || /all skills|ProfileSkillCategory_ALL/i.test(aria);
  });
  if (!control) return;
  for (const eventName of ["pointerover", "mouseover", "pointerdown", "mousedown"]) {
    control.dispatchEvent(new MouseEvent(eventName, { bubbles: true, cancelable: true }));
  }
  control.click();
  for (const eventName of ["mouseup", "pointerup"]) {
    control.dispatchEvent(new MouseEvent(eventName, { bubbles: true, cancelable: true }));
  }
}

function scrollDetailPage(): void {
  const scrollingElement = document.scrollingElement ?? document.documentElement;
  const viewport = window.innerHeight || scrollingElement.clientHeight || 800;
  const maxScrollTop = Math.max(0, scrollingElement.scrollHeight - viewport);
  const nextScrollTop =
    scrollingElement.scrollTop >= maxScrollTop - 4
      ? 0
      : Math.min(
          maxScrollTop,
          scrollingElement.scrollTop + Math.max(360, Math.floor(viewport * 0.85))
        );
  window.scrollTo(0, nextScrollTop);
}

function labelsFromSectionRscText(text: string, section: "skills" | "courses"): string[] {
  const editLabels = editAriaLabelsFromRscText(text, section);
  if (editLabels.length) return editLabels;
  return section === "skills"
    ? stringFieldValuesFromRscText(text, ["skillName", "displayedExpression"])
    : stringFieldValuesFromRscText(text, ["courseName", "title", "displayedExpression"]);
}

function publishCapture(detail: {
  labels: string[];
  responseBytes: number;
  sections: RscSection[];
  status: number;
  type: "pagination";
}): void {
  window.postMessage(
    {
      detail,
      source: RSC_MESSAGE_SOURCE,
      type: RSC_MESSAGE_TYPE
    },
    window.location.origin
  );
  window.dispatchEvent(
    new CustomEvent(RSC_EVENT, {
      detail
    })
  );
}

function publishRecoveryResponse(requestId: string, bridgeToken: string, labels: string[]): void {
  window.dispatchEvent(
    new CustomEvent(RSC_RECOVERY_RESPONSE_EVENT, {
      detail: {
        bridgeToken,
        labels,
        requestId
      }
    })
  );
}

function defineRuntimeFlag<T extends string | number | boolean>(
  runtime: RscRuntime,
  key: string,
  value: T
): void {
  Object.defineProperty(runtime, key, {
    configurable: true,
    enumerable: false,
    value,
    writable: true
  });
}

function sectionsFromRscCapture(requestBody: string, responseText: string): RscSection[] {
  const body = parseJsonRecord(requestBody);
  const filter = [
    stringAt(body, ["clientArguments", "payload", "filter"]),
    stringAt(body, ["paginationRequest", "requestedArguments", "payload", "filter"])
  ]
    .filter(Boolean)
    .join(" ");
  const sections: RscSection[] = [];
  if (
    /skill|ProfileSkillCategory|FullProfileSkillsInjection/i.test(filter) ||
    labelsFromSectionRscText(responseText, "skills").length
  ) {
    sections.push("skills");
  }
  if (
    /course|FullProfileCoursesInjection/i.test(filter) ||
    labelsFromSectionRscText(responseText, "courses").length
  ) {
    sections.push("courses");
  }
  return sections;
}

function labelsFromRscText(text: string): string[] {
  const editLabels = editAriaLabelsFromRscText(text);
  const fieldLabels = stringFieldValuesFromRscText(text, [
    "skillName",
    "courseName",
    "title",
    "displayedExpression"
  ]);
  return mergeLabels([], [...editLabels, ...fieldLabels].filter(isLikelyLabel));
}

function stringFieldValuesFromRscText(text: string, fields: string[]): string[] {
  const labels: string[] = [];
  for (const field of fields) {
    const pattern = new RegExp(
      `\\\\*"${escapeRegExp(field)}\\\\*"\\s*:\\s*\\\\*"((?:\\\\\\\\.|[^"\\\\])*)\\\\*"`,
      "g"
    );
    for (const match of text.matchAll(pattern)) {
      const raw = match[1];
      if (!raw) continue;
      labels.push(decodeRscStringValue(raw));
    }
  }
  return mergeLabels([], labels);
}

function decodeRscStringValue(raw: string): string {
  try {
    const decoded = JSON.parse(`"${raw}"`) as unknown;
    if (typeof decoded === "string") return decoded;
  } catch {
    // Fall through to a conservative escaped-quote cleanup.
  }
  return raw.replace(/\\"/g, '"');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function editAriaLabelsFromRscText(text: string, section?: "skills" | "courses"): string[] {
  const labels: string[] = [];
  const kind =
    section === "courses" ? "course" : section === "skills" ? "skill" : "(?:course|skill)";
  const pattern = new RegExp(
    `"aria-label"\\s*:\\s*"Edit\\s+${kind}\\s+((?:\\\\.|[^"\\\\])*)"`,
    "gi"
  );
  for (const match of text.matchAll(pattern)) {
    const raw = match[1];
    if (!raw) continue;
    try {
      const decoded = JSON.parse(`"${raw}"`) as unknown;
      if (typeof decoded === "string") labels.push(decoded);
    } catch {
      labels.push(raw);
    }
  }
  return labels;
}

function mergeLabels(current: string[], next: string[]): string[] {
  const labels = [...current];
  mergeLabelsInto(labels, next);
  return labels;
}

function mergeLabelsInto(current: string[], next: string[]): void {
  const seen = new Set(current.map((label) => label.trim().toLowerCase()));
  for (const label of next) {
    const normalized = label.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    current.push(normalized);
  }
}

function isLikelyLabel(value: string): boolean {
  const text = value.trim();
  if (text.length < 2 || text.length > 160) return false;
  if (/^(show all|show more|top skills|skills|courses|licenses|projects)$/i.test(text))
    return false;
  if (/^(associated with|endorsement|endorsed by|view|follow|message|connect)$/i.test(text))
    return false;
  return /[A-Za-z]/.test(text);
}

function requestUrlFromFetchArgs(args: Parameters<typeof fetch>): string {
  const [input] = args;
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function requestBodyFromFetchArgs(args: Parameters<typeof fetch>): string {
  const [input, init] = args;
  const body = init?.body ?? (input instanceof Request ? input.body : undefined);
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  return "";
}

function replayHeadersFromFetchArgs(args: Parameters<typeof fetch>): Record<string, string> {
  const [input, init] = args;
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (!RSC_REPLAY_HEADER_ALLOWLIST.has(key.toLowerCase())) return;
    record[key] = value;
  });
  return record;
}

function parseJsonRecord(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function numericAt(root: Record<string, unknown>, path: string[]): number | undefined {
  let current: unknown = root;
  for (const key of path) {
    current =
      current && typeof current === "object"
        ? (current as Record<string, unknown>)[key]
        : undefined;
  }
  return typeof current === "number" && Number.isFinite(current) ? current : undefined;
}

function stringAt(root: Record<string, unknown> | undefined, path: string[]): string | undefined {
  let current: unknown = root;
  for (const key of path) {
    current =
      current && typeof current === "object"
        ? (current as Record<string, unknown>)[key]
        : undefined;
  }
  return typeof current === "string" ? current : undefined;
}

function withStart(root: Record<string, unknown>, start: number): Record<string, unknown> {
  const next = structuredClone(root) as Record<string, unknown>;
  setNumber(next, ["clientArguments", "payload", "start"], start);
  setNumber(next, ["paginationRequest", "requestedArguments", "payload", "start"], start);
  return next;
}

function setNumber(root: Record<string, unknown>, path: string[], value: number): void {
  let current: Record<string, unknown> | undefined = root;
  for (const key of path.slice(0, -1)) {
    const nested: unknown = current?.[key];
    current =
      nested && typeof nested === "object" && !Array.isArray(nested)
        ? (nested as Record<string, unknown>)
        : undefined;
    if (!current) return;
  }
  current[path[path.length - 1] ?? ""] = value;
}

function replayHeaders(headers: Record<string, string>): Headers {
  const replay = new Headers(headers);
  if (!replay.has("content-type")) replay.set("content-type", "application/json");
  return replay;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
