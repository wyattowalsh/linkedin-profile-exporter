import { readFile } from "node:fs/promises";
import { join } from "node:path";

type DevToolsTarget = {
  browserWebSocketDebuggerUrl?: string;
  createdByProbe?: boolean;
  id: string;
  title?: string;
  type: string;
  url?: string;
  webSocketDebuggerUrl?: string;
};

type BrowserTargetInfo = {
  targetId: string;
  title?: string;
  type: string;
  url?: string;
};

type DevToolsResponse = {
  error?: { code?: number; message?: string };
  exceptionDetails?: { text?: string };
  id?: number;
  result?: {
    exceptionDetails?: { exception?: { description?: string }; text?: string };
    result?: { description?: string; type?: string; value?: unknown };
  };
  sessionId?: string;
};

type WebSocketLike = {
  close: () => void;
  send: (data: string) => void;
  addEventListener: (
    event: "close" | "error" | "message" | "open",
    listener: (payload: any) => void
  ) => void;
};

type CliOptions = {
  extensionId?: string;
  host: string;
  port: number;
  profileUrl?: string;
  timeoutMs: number;
};

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 9222;
const DEFAULT_TIMEOUT_MS = 90_000;
const EXTENSION_NAME_PATTERN = /linkedin profile exporter|profile exporter/i;

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const targets = await loadTargets(options);
  const target =
    (await findExtensionTarget(targets, options)) ?? (await createExtensionPageTarget(options));
  if (!target) {
    throw new Error(
      [
        "Could not find a debuggable extension context over Chrome DevTools Protocol.",
        `Checked http://${options.host}:${options.port}/json/list and browser target discovery.`,
        "Start Chrome with --remote-debugging-port=9222, load the extension, open a LinkedIn profile tab, then rerun this command.",
        "Pass --extension-id <id> to wake the extension through its popup page when the service worker is asleep."
      ].join(" ")
    );
  }

  try {
    await withTargetClient(target, async (client, sessionId) => {
      const summary = await client.evaluate(buildProbeExpression(options), sessionId);
      console.log(JSON.stringify(summary, null, 2));
      if (!isOkProbeResult(summary)) process.exitCode = 1;
    });
  } finally {
    if (target.createdByProbe) await closeTarget(target);
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    timeoutMs: DEFAULT_TIMEOUT_MS
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--") continue;
    if (arg === "--host" && next) {
      options.host = next;
      index += 1;
      continue;
    }
    if (arg === "--port" && next) {
      options.port = Number(next);
      index += 1;
      continue;
    }
    if (arg === "--extension-id" && next) {
      options.extensionId = next;
      index += 1;
      continue;
    }
    if (arg === "--profile-url" && next) {
      options.profileUrl = next;
      index += 1;
      continue;
    }
    if (arg === "--timeout-ms" && next) {
      options.timeoutMs = Number(next);
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    throw new Error(`Unknown or incomplete argument: ${arg ?? ""}`);
  }
  if (!Number.isFinite(options.port) || options.port <= 0) {
    throw new Error(`Invalid --port value: ${options.port}`);
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error(`Invalid --timeout-ms value: ${options.timeoutMs}`);
  }
  return options;
}

function printHelp(): void {
  console.log(`Usage: pnpm probe:live -- [options]

Options:
  --host <host>             Chrome DevTools host. Defaults to ${DEFAULT_HOST}.
  --port <port>             Chrome DevTools port. Defaults to ${DEFAULT_PORT}.
  --extension-id <id>       Extension id; also wakes a sleeping worker through popup.html.
  --profile-url <url>       Exact LinkedIn profile tab URL to probe.
  --timeout-ms <ms>         Extraction timeout. Defaults to ${DEFAULT_TIMEOUT_MS}.
`);
}

async function loadTargets(options: CliOptions): Promise<DevToolsTarget[]> {
  const targets = await loadHttpTargets(options);
  if (targets.length > 0) return targets;
  const browserTargets = await loadBrowserTargetsFromVersion(options);
  if (browserTargets.length > 0) return browserTargets;
  return loadBrowserTargetsFromActivePort(options);
}

async function loadHttpTargets(options: CliOptions): Promise<DevToolsTarget[]> {
  const endpoints = [
    `http://${options.host}:${options.port}/json/list`,
    `http://${options.host}:${options.port}/json`
  ];
  for (const endpoint of endpoints) {
    const targets = await loadHttpTargetEndpoint(endpoint);
    if (targets.length > 0) return targets;
  }
  return [];
}

async function loadHttpTargetEndpoint(endpoint: string): Promise<DevToolsTarget[]> {
  let response: Response;
  try {
    response = await fetch(endpoint);
  } catch (error) {
    if (isConnectionError(error)) {
      throw new Error(`Could not reach Chrome DevTools at ${endpoint}. ${sanitizeMessage(error)}`);
    }
    return [];
  }
  if (!response.ok) return [];
  const targets = (await response.json()) as unknown;
  if (!Array.isArray(targets)) return [];
  return targets.filter(isDevToolsTarget);
}

async function loadBrowserTargetsFromVersion(options: CliOptions): Promise<DevToolsTarget[]> {
  const endpoint = `http://${options.host}:${options.port}/json/version`;
  let response: Response;
  try {
    response = await fetch(endpoint);
  } catch {
    return [];
  }
  if (!response.ok) return [];
  const version = (await response.json()) as { webSocketDebuggerUrl?: string };
  if (!version.webSocketDebuggerUrl) return [];
  return browserTargets(version.webSocketDebuggerUrl);
}

async function loadBrowserTargetsFromActivePort(options: CliOptions): Promise<DevToolsTarget[]> {
  if (options.host !== "127.0.0.1" && options.host !== "localhost") return [];
  try {
    const activePortPath = join(
      process.env.HOME ?? "",
      "Library",
      "Application Support",
      "Google",
      "Chrome",
      "DevToolsActivePort"
    );
    const [port, path] = (await readFile(activePortPath, "utf8")).trim().split(/\n/);
    if (!port || !path) return [];
    if (Number(port) !== options.port) return [];
    return browserTargets(`ws://127.0.0.1:${port}${path}`);
  } catch {
    return [];
  }
}

async function browserTargets(browserWebSocketDebuggerUrl: string): Promise<DevToolsTarget[]> {
  let client: CdpClient | undefined;
  try {
    client = await CdpClient.connect(browserWebSocketDebuggerUrl, 3_000);
    const response = (await client.request("Target.getTargets")) as {
      targetInfos?: BrowserTargetInfo[];
    };
    return (response.targetInfos ?? []).map((target) => ({
      browserWebSocketDebuggerUrl,
      id: target.targetId,
      type: target.type,
      ...(target.title ? { title: target.title } : {}),
      ...(target.url ? { url: target.url } : {})
    }));
  } catch {
    return [];
  } finally {
    client?.close();
  }
}

function isDevToolsTarget(value: unknown): value is DevToolsTarget {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as DevToolsTarget).id === "string" &&
    typeof (value as DevToolsTarget).type === "string"
  );
}

async function findExtensionTarget(
  targets: DevToolsTarget[],
  options: CliOptions
): Promise<DevToolsTarget | undefined> {
  const extensionTargets = targets.filter(isExtensionContextTarget);
  if (options.extensionId) {
    return extensionTargets.find((target) =>
      target.url?.startsWith(`chrome-extension://${options.extensionId}/`)
    );
  }
  const namedTarget = extensionTargets.find(
    (target) =>
      EXTENSION_NAME_PATTERN.test(target.title ?? "") ||
      EXTENSION_NAME_PATTERN.test(target.url ?? "")
  );
  if (namedTarget) return namedTarget;
  if (extensionTargets.length === 1) return extensionTargets[0];

  for (const target of extensionTargets) {
    const name = await extensionName(target);
    if (name && EXTENSION_NAME_PATTERN.test(name)) return target;
  }
  return undefined;
}

function isExtensionContextTarget(target: DevToolsTarget): boolean {
  return Boolean(
    (target.type === "service_worker" ||
      target.type === "background_page" ||
      target.type === "page") &&
    target.url?.startsWith("chrome-extension://") &&
    isDebuggableTarget(target)
  );
}

async function createExtensionPageTarget(options: CliOptions): Promise<DevToolsTarget | undefined> {
  if (!options.extensionId) return undefined;
  const browserWebSocketDebuggerUrl = await browserWebSocketDebuggerUrlForOptions(options);
  if (!browserWebSocketDebuggerUrl) return undefined;
  let client: CdpClient | undefined;
  try {
    client = await CdpClient.connect(browserWebSocketDebuggerUrl, 3_000);
    const response = (await client.request("Target.createTarget", {
      url: `chrome-extension://${options.extensionId}/popup.html`
    })) as { targetId?: string };
    if (!response.targetId) return undefined;
    return {
      browserWebSocketDebuggerUrl,
      createdByProbe: true,
      id: response.targetId,
      type: "page",
      url: `chrome-extension://${options.extensionId}/popup.html`
    };
  } catch {
    return undefined;
  } finally {
    client?.close();
  }
}

async function browserWebSocketDebuggerUrlForOptions(
  options: CliOptions
): Promise<string | undefined> {
  const endpoint = `http://${options.host}:${options.port}/json/version`;
  try {
    const response = await fetch(endpoint);
    if (response.ok) {
      const version = (await response.json()) as { webSocketDebuggerUrl?: string };
      if (version.webSocketDebuggerUrl) return version.webSocketDebuggerUrl;
    }
  } catch {
    // Fall through to the DevToolsActivePort path.
  }
  if (options.host !== "127.0.0.1" && options.host !== "localhost") return undefined;
  try {
    const activePortPath = join(
      process.env.HOME ?? "",
      "Library",
      "Application Support",
      "Google",
      "Chrome",
      "DevToolsActivePort"
    );
    const [port, path] = (await readFile(activePortPath, "utf8")).trim().split(/\n/);
    if (!port || !path || Number(port) !== options.port) return undefined;
    return `ws://127.0.0.1:${port}${path}`;
  } catch {
    return undefined;
  }
}

async function closeTarget(target: DevToolsTarget): Promise<void> {
  if (!target.browserWebSocketDebuggerUrl) return;
  let client: CdpClient | undefined;
  try {
    client = await CdpClient.connect(target.browserWebSocketDebuggerUrl, 3_000);
    await client.request("Target.closeTarget", { targetId: target.id });
  } catch {
    // Best-effort cleanup only.
  } finally {
    client?.close();
  }
}

async function extensionName(target: DevToolsTarget): Promise<string | undefined> {
  try {
    return await withTargetClient(target, async (client, sessionId) => {
      const result = await client.evaluate(
        `(() => {
          try {
            return chrome.runtime.getManifest().name;
          } catch {
            return undefined;
          }
        })()`,
        sessionId
      );
      return typeof result === "string" ? result : undefined;
    });
  } catch {
    return undefined;
  }
}

async function withTargetClient<T>(
  target: DevToolsTarget,
  callback: (client: CdpClient, sessionId?: string) => Promise<T>
): Promise<T> {
  if (target.webSocketDebuggerUrl) {
    const client = await CdpClient.connect(target.webSocketDebuggerUrl);
    try {
      return await callback(client);
    } finally {
      client.close();
    }
  }
  if (!target.browserWebSocketDebuggerUrl) {
    throw new Error("DevTools target is missing a debuggable socket.");
  }
  const client = await CdpClient.connect(target.browserWebSocketDebuggerUrl);
  try {
    const sessionId = await client.attachToTarget(target.id);
    return await callback(client, sessionId);
  } finally {
    client.close();
  }
}

function isDebuggableTarget(target: DevToolsTarget): boolean {
  return Boolean(target.webSocketDebuggerUrl || target.browserWebSocketDebuggerUrl);
}

class CdpClient {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { reject: (error: Error) => void; resolve: (value: unknown) => void }
  >();

  private constructor(private readonly socket: WebSocketLike) {
    socket.addEventListener("message", (event) => this.handleMessage(event));
    socket.addEventListener("close", () =>
      this.rejectAll(new Error("Chrome DevTools socket closed."))
    );
    socket.addEventListener("error", () =>
      this.rejectAll(new Error("Chrome DevTools socket errored."))
    );
  }

  static async connect(url: string, timeoutMs = 5_000): Promise<CdpClient> {
    const WebSocketCtor = (globalThis as { WebSocket?: new (url: string) => WebSocketLike })
      .WebSocket;
    if (!WebSocketCtor) {
      throw new Error("This Node runtime does not expose WebSocket; use Node 22+.");
    }
    const socket = new WebSocketCtor(url);
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.close();
        reject(new Error("Timed out opening Chrome DevTools socket."));
      }, timeoutMs);
      socket.addEventListener("open", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      });
      socket.addEventListener("error", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        socket.close();
        reject(new Error("Could not open Chrome DevTools socket."));
      });
    });
    return new CdpClient(socket);
  }

  close(): void {
    this.socket.close();
  }

  async attachToTarget(targetId: string): Promise<string> {
    const response = (await this.request("Target.attachToTarget", {
      flatten: true,
      targetId
    })) as { sessionId?: string };
    if (!response.sessionId) throw new Error("Chrome DevTools did not return a target session.");
    return response.sessionId;
  }

  async evaluate(expression: string, sessionId?: string): Promise<unknown> {
    const response = (await this.request(
      "Runtime.evaluate",
      {
        awaitPromise: true,
        expression,
        returnByValue: true
      },
      sessionId
    )) as NonNullable<DevToolsResponse["result"]>;
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description ??
          response.exceptionDetails.text ??
          "Chrome DevTools evaluation failed."
      );
    }
    if (response.result?.type === "undefined") {
      throw new Error("Chrome DevTools evaluation returned undefined.");
    }
    return response.result?.value;
  }

  request(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string
  ): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { reject, resolve });
      this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  private handleMessage(event: { data?: unknown }): void {
    const text =
      typeof event.data === "string"
        ? event.data
        : Buffer.from(event.data as ArrayBuffer).toString("utf8");
    const message = JSON.parse(text) as DevToolsResponse;
    if (!message.id) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(
        new Error(message.error.message ?? `Chrome DevTools error ${message.error.code}`)
      );
      return;
    }
    if (message.exceptionDetails) {
      pending.reject(
        new Error(message.exceptionDetails.text ?? "Chrome DevTools evaluation failed.")
      );
      return;
    }
    pending.resolve(message.result);
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

function buildProbeExpression(options: CliOptions): string {
  const input = {
    profileUrl: options.profileUrl ?? null,
    timeoutMs: options.timeoutMs
  };
  return `(() => {
    const __name = (target) => target;
    return (${serviceWorkerProbe.toString()})(${JSON.stringify(input)});
  })()`;
}

function serviceWorkerProbe(input: { profileUrl: string | null; timeoutMs: number }) {
  type ChromeTab = {
    active?: boolean;
    highlighted?: boolean;
    id?: number;
    lastAccessed?: number;
    url?: string;
  };

  const chromeApi = (globalThis as any).chrome;
  const profileTabPattern = /^https:\/\/www\.linkedin\.com\/in\//i;
  const timeoutMs = input.timeoutMs;
  const startedAt = Date.now();

  function sanitize(message: unknown) {
    return String(message instanceof Error ? message.message : message)
      .replace(
        /https:\/\/www\.linkedin\.com\/in\/[^\s)"']+/gi,
        "https://www.linkedin.com/in/<profile>/"
      )
      .slice(0, 500);
  }

  function chromeCall(fn: (...args: any[]) => void, ...args: unknown[]) {
    return new Promise((resolve, reject) => {
      fn(...args, (result: unknown) => {
        const lastError = chromeApi.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve(result);
      });
    });
  }

  function isProfileUrl(url: unknown) {
    return typeof url === "string" && profileTabPattern.test(url);
  }

  function sameRequestedProfile(url: string) {
    if (!input.profileUrl) return true;
    try {
      const requested = new URL(input.profileUrl);
      const candidate = new URL(url);
      return requested.origin === candidate.origin && requested.pathname === candidate.pathname;
    } catch {
      return url === input.profileUrl;
    }
  }

  function tabRank(tab: ChromeTab) {
    let rank = 0;
    if (tab.active) rank += 10;
    if (tab.highlighted) rank += 2;
    return rank;
  }

  async function selectedProfileTab() {
    const tabs = (await chromeCall(chromeApi.tabs.query, {})) as ChromeTab[];
    return tabs
      .filter((tab) => tab.id && isProfileUrl(tab.url) && sameRequestedProfile(tab.url ?? ""))
      .sort((left, right) => {
        const rankDiff = tabRank(right) - tabRank(left);
        if (rankDiff) return rankDiff;
        return (
          (right.lastAccessed ?? 0) - (left.lastAccessed ?? 0) || (right.id ?? 0) - (left.id ?? 0)
        );
      })[0];
  }

  function missingReceiver(error: unknown) {
    return /Could not establish connection|Receiving end does not exist|No matching message handler|message channel closed before a response was received|asynchronous response/i.test(
      sanitize(error)
    );
  }

  async function sendMessage(tabId: number, message: unknown) {
    return chromeCall(chromeApi.tabs.sendMessage, tabId, message);
  }

  function linkedinContentScriptFile() {
    const manifest = chromeApi.runtime.getManifest() as {
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

  async function recoverContentScript(tabId: number) {
    if (!chromeApi.scripting?.executeScript) {
      return {
        ok: false,
        reason: "runtime content-script recovery is unavailable for this browser target"
      };
    }
    await chromeCall(chromeApi.scripting.executeScript, {
      target: { tabId },
      files: [linkedinContentScriptFile()]
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { ok: true };
  }

  async function ensureReceiver(tabId: number) {
    try {
      return {
        response: await sendMessage(tabId, { type: "profile-readiness" }),
        recovered: false
      };
    } catch (error) {
      if (!missingReceiver(error)) throw error;
    }
    const recovery = await recoverContentScript(tabId);
    if (!recovery.ok) return { response: recovery, recovered: false };
    return { response: await sendMessage(tabId, { type: "profile-readiness" }), recovered: true };
  }

  function extractionSettings() {
    return {
      dataScope: {
        education: true,
        experience: true,
        extendedSections: true,
        identity: true,
        imageryMetadata: true,
        skills: true
      },
      automationMode: "review-before-export",
      deliveryMode: "clipboard",
      autoScroll: true,
      expandShowMore: true,
      outputFormats: ["json", "markdown"],
      filenameTemplate: "{name}-{date}-{format}",
      privacy: {
        analyticsEnabled: false,
        localOnly: true,
        persistExtractedData: false,
        remoteUploadEnabled: false
      },
      diagnostics: {
        includeAllFields: true,
        includeConfidence: false,
        includeProvenance: false,
        verbose: false
      }
    };
  }

  function withTimeout<T>(promise: Promise<T>, label: string) {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  function countArray(value: unknown) {
    return Array.isArray(value) ? value.length : 0;
  }

  function summarize(profile: any, meta: { contentScriptRecovered: boolean; tab: ChromeTab }) {
    const diagnostics = Array.isArray(profile?.diagnostics) ? profile.diagnostics : [];
    const codes: string[] = Array.from(
      new Set<string>(
        diagnostics
          .map((diagnostic: any) => diagnostic?.code)
          .filter((code: unknown): code is string => typeof code === "string")
      )
    ).sort();
    const coverageCodes = codes.filter((code) => code.startsWith("coverage."));
    const diagnosticItems = diagnostics
      .map((diagnostic: any) => ({
        code: typeof diagnostic?.code === "string" ? diagnostic.code : "unknown",
        level: typeof diagnostic?.level === "string" ? diagnostic.level : "unknown",
        message: sanitize(diagnostic?.message ?? ""),
        source: typeof diagnostic?.source === "string" ? diagnostic.source : "unknown"
      }))
      .filter(
        (diagnostic: { code: string; level: string; message: string; source: string }) =>
          diagnostic.level === "warning" ||
          diagnostic.code.startsWith("coverage.") ||
          /skills|courses|\.failed$|\.partial$|possibly-capped|budget/i.test(diagnostic.code)
      )
      .slice(0, 30);
    const diagnosticLevels = diagnostics.reduce(
      (levels: Record<string, number>, diagnostic: any) => {
        const level = typeof diagnostic?.level === "string" ? diagnostic.level : "unknown";
        levels[level] = (levels[level] ?? 0) + 1;
        return levels;
      },
      {}
    );
    const sectionCoverage = coverageCodes.reduce((sections: Record<string, string[]>, code) => {
      const match = /^coverage\.([^.]+)\.([^.]+)$/.exec(code);
      if (!match) return sections;
      const section = match[1] ?? "unknown";
      const state = match[2] ?? "unknown";
      sections[section] = Array.from(new Set([...(sections[section] ?? []), state])).sort();
      return sections;
    }, {});
    const identity = profile?.identity ?? {};
    const counts = {
      work: countArray(profile?.work),
      roles: Array.isArray(profile?.work)
        ? profile.work.reduce((total: number, item: any) => total + countArray(item?.roles), 0)
        : 0,
      education: countArray(profile?.education),
      skills: countArray(profile?.skills),
      licensesCertifications: countArray(profile?.licensesCertifications),
      projects: countArray(profile?.projects),
      publications: countArray(profile?.publications),
      volunteering: countArray(profile?.volunteering),
      honorsAwards: countArray(profile?.honorsAwards),
      testScores: countArray(profile?.testScores),
      patents: countArray(profile?.patents),
      languages: countArray(profile?.languages),
      courses: countArray(profile?.courses),
      recommendations: countArray(profile?.recommendations),
      featured: countArray(profile?.featured),
      organizations: countArray(profile?.organizations),
      interests: countArray(profile?.interests),
      links: countArray(identity.links),
      imagery:
        Number(Boolean(identity.imagery?.profileImageUrl)) +
        Number(Boolean(identity.imagery?.backgroundImageUrl)),
      connections: typeof identity.connections === "string" ? identity.connections : null,
      followers: typeof identity.followers === "string" ? identity.followers : null
    };
    const warnings = Array.from(
      new Set([
        ...coverageCodes.filter((code) => /\.(partial|capped|unavailable)$/.test(code)),
        ...codes.filter((code) => /default-page-size|budget\.exhausted|timed-out/i.test(code)),
        ...(counts.skills === 20 ? ["skills-count-is-20"] : []),
        ...(counts.courses === 20 ? ["courses-count-is-20"] : []),
        ...(counts.projects === 20 ? ["projects-count-is-20"] : []),
        ...(counts.featured === 20 ? ["featured-count-is-20"] : [])
      ])
    ).sort();
    return {
      ok: true,
      durationMs: Date.now() - startedAt,
      target: {
        tabActive: Boolean(meta.tab.active),
        tabHighlighted: Boolean(meta.tab.highlighted),
        urlHost: meta.tab.url ? new URL(meta.tab.url).host : null,
        urlKind: "linkedin-profile"
      },
      contentScriptRecovered: meta.contentScriptRecovered,
      identity: {
        aboutPresent: Boolean(identity.about),
        headlinePresent: Boolean(identity.headline),
        locationPresent: Boolean(identity.location),
        namePresent: Boolean(identity.name)
      },
      counts,
      diagnostics: {
        count: diagnostics.length,
        coverageCodes,
        items: diagnosticItems,
        diagnosticLevels,
        sectionCoverage
      },
      warnings
    };
  }

  return (async () => {
    try {
      const tab = await selectedProfileTab();
      if (!tab?.id) {
        return {
          ok: false,
          durationMs: Date.now() - startedAt,
          error: input.profileUrl
            ? "No matching LinkedIn profile tab is available."
            : "No LinkedIn profile tab is available."
        };
      }
      const readiness = await ensureReceiver(tab.id);
      const readinessResponse = readiness.response as any;
      if (!readinessResponse?.ok) {
        return {
          ok: false,
          durationMs: Date.now() - startedAt,
          error: sanitize(
            readinessResponse?.error ?? readinessResponse?.reason ?? "Profile readiness failed."
          )
        };
      }
      const requestId = `live-probe-${Date.now()}`;
      const response = (await withTimeout(
        sendMessage(tab.id, {
          type: "extract-profile",
          requestId,
          settings: extractionSettings()
        }),
        "Profile extraction"
      )) as any;
      if (!response?.ok) {
        return {
          ok: false,
          durationMs: Date.now() - startedAt,
          error: sanitize(response?.error ?? "Profile extraction failed.")
        };
      }
      return summarize(response.profile, {
        contentScriptRecovered: Boolean(readiness.recovered),
        tab
      });
    } catch (error) {
      return {
        ok: false,
        durationMs: Date.now() - startedAt,
        error: sanitize(error)
      };
    }
  })();
}

function isOkProbeResult(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && (value as { ok?: unknown }).ok === true);
}

function sanitizeMessage(error: unknown): string {
  return String(error instanceof Error ? error.message : error).slice(0, 500);
}

function isConnectionError(error: unknown): boolean {
  return /ECONNREFUSED|fetch failed|connection/i.test(sanitizeMessage(error));
}

main().catch((error: unknown) => {
  console.error(sanitizeMessage(error));
  process.exitCode = 1;
});
