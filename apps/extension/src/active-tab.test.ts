import { beforeEach, describe, expect, it, vi } from "vitest";

const browserMock = vi.hoisted(() => ({
  runtime: {
    getManifest: vi.fn(),
    getURL: vi.fn()
  },
  scripting: {
    executeScript: vi.fn()
  },
  tabs: {
    executeScript: vi.fn(),
    query: vi.fn(),
    sendMessage: vi.fn()
  }
}));

vi.mock("wxt/browser", () => ({ browser: browserMock }));

const { currentProfileTabForExtensionContext, sendToActiveProfileTab } =
  await import("./active-tab");

describe("sendToActiveProfileTab", () => {
  beforeEach(() => {
    browserMock.runtime.getManifest.mockReset();
    browserMock.runtime.getManifest.mockReturnValue({
      content_scripts: [
        { matches: ["https://www.linkedin.com/in/*"], js: ["content-scripts/linkedin.js"] }
      ]
    });
    browserMock.runtime.getURL.mockReset();
    browserMock.runtime.getURL.mockImplementation((path: string) => `chrome-extension://id${path}`);
    browserMock.scripting.executeScript = vi.fn();
    browserMock.tabs.executeScript = vi.fn();
    browserMock.tabs.query.mockReset();
    browserMock.tabs.query.mockResolvedValue([profileTab()]);
    browserMock.tabs.sendMessage.mockReset();
  });

  it("sends directly when the content script is already available", async () => {
    browserMock.tabs.sendMessage.mockResolvedValue({
      ok: true,
      readiness: { state: "ready" }
    });

    await expect(sendToActiveProfileTab({ type: "profile-readiness" })).resolves.toMatchObject({
      ok: true,
      readiness: { state: "ready" }
    });
    expect(browserMock.tabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(browserMock.scripting.executeScript).not.toHaveBeenCalled();
  });

  it("returns URL readiness without messaging unavailable tabs", async () => {
    browserMock.tabs.query.mockResolvedValue([
      { ...profileTab(), url: "https://www.linkedin.com/feed/" }
    ]);

    await expect(sendToActiveProfileTab({ type: "profile-readiness" })).resolves.toMatchObject({
      ok: true,
      readiness: { state: "unavailable" }
    });
    expect(browserMock.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it("injects the manifest-listed content script and retries missing receiver failures", async () => {
    browserMock.tabs.sendMessage
      .mockRejectedValueOnce(
        new Error("Could not establish connection. Receiving end does not exist.")
      )
      .mockResolvedValueOnce({ ok: true, readiness: { state: "ready" } });

    await expect(sendToActiveProfileTab({ type: "profile-readiness" })).resolves.toMatchObject({
      ok: true,
      readiness: { state: "ready" }
    });
    expect(browserMock.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 1 },
      files: ["content-scripts/linkedin.js"]
    });
    expect(browserMock.tabs.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("reinjects after Chrome reports a stale async content-script channel", async () => {
    browserMock.tabs.sendMessage
      .mockRejectedValueOnce(
        new Error(
          "A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received"
        )
      )
      .mockResolvedValueOnce({ ok: true, readiness: { state: "ready" } });

    await expect(sendToActiveProfileTab({ type: "profile-readiness" })).resolves.toMatchObject({
      ok: true,
      readiness: { state: "ready" }
    });
    expect(browserMock.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 1 },
      files: ["content-scripts/linkedin.js"]
    });
    expect(browserMock.tabs.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("reinjects when a stale readiness message never resolves", async () => {
    browserMock.tabs.sendMessage
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockResolvedValueOnce({ ok: true, readiness: { state: "ready" } });

    await expect(sendToActiveProfileTab({ type: "profile-readiness" })).resolves.toMatchObject({
      ok: true,
      readiness: { state: "ready" }
    });
    expect(browserMock.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 1 },
      files: ["content-scripts/linkedin.js"]
    });
    expect(browserMock.tabs.sendMessage).toHaveBeenCalledTimes(2);
  }, 7_500);

  it("injects the message-handler script when the RSC hook is listed first", async () => {
    browserMock.runtime.getManifest.mockReturnValue({
      content_scripts: [
        {
          matches: ["https://www.linkedin.com/in/*"],
          js: ["content-scripts/linkedin-rsc-hook.js"]
        },
        { matches: ["https://www.linkedin.com/in/*"], js: ["content-scripts/linkedin.js"] }
      ]
    });
    browserMock.tabs.sendMessage
      .mockRejectedValueOnce(new Error("Receiving end does not exist."))
      .mockResolvedValueOnce({ ok: true, readiness: { state: "ready" } });

    await sendToActiveProfileTab({ type: "profile-readiness" });
    expect(browserMock.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 1 },
      files: ["content-scripts/linkedin.js"]
    });
  });

  it("falls back to the default WXT content script file when manifest data is missing", async () => {
    browserMock.runtime.getManifest.mockReturnValue({ content_scripts: [] });
    browserMock.tabs.sendMessage
      .mockRejectedValueOnce(new Error("Receiving end does not exist."))
      .mockResolvedValueOnce({ ok: true, readiness: { state: "ready" } });

    await sendToActiveProfileTab({ type: "profile-readiness" });
    expect(browserMock.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 1 },
      files: ["content-scripts/linkedin.js"]
    });
  });

  it("does not retry non-receiver messaging failures", async () => {
    browserMock.tabs.sendMessage.mockRejectedValue(new Error("No tab with id: 1."));

    await expect(sendToActiveProfileTab({ type: "profile-readiness" })).resolves.toMatchObject({
      ok: false,
      error: "No tab with id: 1."
    });
    expect(browserMock.scripting.executeScript).not.toHaveBeenCalled();
  });

  it("reports unsupported recovery when no injection API is available", async () => {
    browserMock.scripting.executeScript = undefined as never;
    browserMock.tabs.executeScript = undefined as never;
    browserMock.tabs.sendMessage.mockRejectedValue(new Error("Receiving end does not exist."));

    await expect(sendToActiveProfileTab({ type: "profile-readiness" })).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("does not expose runtime content-script recovery")
    });
  });

  it("chooses the most recently accessed same-window profile tab when an extension page is active", async () => {
    browserMock.tabs.query
      .mockResolvedValueOnce([
        {
          active: true,
          id: 99,
          url: "chrome-extension://id/popup.html",
          windowId: 1
        }
      ])
      .mockResolvedValueOnce([
        profileTab({ active: false, id: 1, lastAccessed: 100, windowId: 1 }),
        profileTab({ active: false, id: 2, lastAccessed: 200, windowId: 1 }),
        profileTab({ active: false, id: 3, lastAccessed: 300, windowId: 2 })
      ]);

    await expect(currentProfileTabForExtensionContext()).resolves.toMatchObject({
      id: 2,
      url: "https://www.linkedin.com/in/alex-rivera/"
    });
  });

  it("prefers a same-window inactive profile over an active profile in another window", async () => {
    browserMock.tabs.query
      .mockResolvedValueOnce([
        {
          active: true,
          id: 99,
          url: "chrome-extension://id/options.html",
          windowId: 1
        }
      ])
      .mockResolvedValueOnce([
        profileTab({ active: false, id: 1, lastAccessed: 100, windowId: 1 }),
        profileTab({ active: true, id: 2, lastAccessed: 300, windowId: 2 })
      ]);

    await expect(currentProfileTabForExtensionContext()).resolves.toMatchObject({
      id: 1,
      url: "https://www.linkedin.com/in/alex-rivera/"
    });
  });
});

function profileTab(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    id: 1,
    lastAccessed: 1,
    url: "https://www.linkedin.com/in/alex-rivera/",
    windowId: 1,
    ...overrides
  };
}
