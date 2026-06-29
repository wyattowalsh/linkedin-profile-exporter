import { beforeEach, describe, expect, it, vi } from "vitest";

const listenerState = vi.hoisted(() => ({
  runtimeMessage: undefined as
    | ((
        message: unknown,
        sender: unknown,
        sendResponse: (response: unknown) => void
      ) => boolean | unknown | undefined)
    | undefined
}));

const browserMock = vi.hoisted(() => ({
  action: {
    enable: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
    setBadgeText: vi.fn(),
    setBadgeTextColor: vi.fn(),
    setTitle: vi.fn()
  },
  runtime: {
    onMessage: {
      addListener: vi.fn(
        (
          listener: (
            message: unknown,
            sender: unknown,
            sendResponse: (response: unknown) => void
          ) => boolean | unknown | undefined
        ) => {
          listenerState.runtimeMessage = listener;
        }
      )
    }
  },
  scripting: {
    executeScript: vi.fn()
  },
  tabs: {
    create: vi.fn(),
    get: vi.fn(),
    onActivated: { addListener: vi.fn() },
    onRemoved: { addListener: vi.fn() },
    onUpdated: { addListener: vi.fn() },
    query: vi.fn(async () => []),
    reload: vi.fn(),
    remove: vi.fn(),
    sendMessage: vi.fn(),
    update: vi.fn()
  }
}));

vi.mock("wxt/browser", () => ({ browser: browserMock }));
vi.mock("wxt/utils/define-background", () => ({
  defineBackground: (setup: () => void) => {
    setup();
    return setup;
  }
}));

await import("../entrypoints/background");

describe("background detail-tab recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    browserMock.tabs.query.mockResolvedValue([profileTab(1)] as never);
    browserMock.tabs.create.mockResolvedValue({ id: 2 });
    browserMock.tabs.get.mockResolvedValue({
      id: 2,
      status: "complete",
      url: "https://www.linkedin.com/in/alex-rivera/details/skills/"
    });
    browserMock.tabs.reload.mockResolvedValue(undefined);
    browserMock.tabs.remove.mockResolvedValue(undefined);
    browserMock.tabs.update.mockResolvedValue(undefined);
    browserMock.tabs.sendMessage.mockResolvedValue({
      ok: true,
      detail: detailWithSkills(97)
    });
    browserMock.scripting.executeScript.mockResolvedValue([]);
  });

  it("recovers detail data from an inactive tab without activating it", async () => {
    const response = await sendRuntimeMessage({
      section: "skills",
      targetCount: 97,
      timeoutMs: 200,
      type: "recover-detail-section-tab",
      url: "https://www.linkedin.com/in/alex-rivera/details/skills/"
    });

    expect(response).toMatchObject({ ok: true });
    expect(browserMock.tabs.create).toHaveBeenCalledWith(
      {
        active: false,
        url: "https://www.linkedin.com/in/alex-rivera/details/skills/"
      },
      expect.any(Function)
    );
    expect(browserMock.tabs.update).not.toHaveBeenCalledWith(2, { active: true });
    expect(browserMock.tabs.update).not.toHaveBeenCalledWith(
      2,
      {
        url: "https://www.linkedin.com/in/alex-rivera/details/skills/"
      },
      expect.any(Function)
    );
    await waitForIdleDetailTabClose();
    expect(browserMock.tabs.remove).toHaveBeenCalledWith(2, expect.any(Function));
  });

  it("uses RSC label fallback when the first detail response is partial and RSC is richer", async () => {
    browserMock.tabs.sendMessage.mockResolvedValue({
      ok: true,
      detail: detailWithSkills(20)
    });
    browserMock.scripting.executeScript.mockImplementation(async (details: { func?: unknown }) =>
      details.func ? [{ result: { labels: skillLabels(97) } }] : []
    );

    const response = await sendRuntimeMessage({
      section: "skills",
      targetCount: 97,
      timeoutMs: 200,
      type: "recover-detail-section-tab",
      url: "https://www.linkedin.com/in/alex-rivera/details/skills/"
    });

    expect(response).toMatchObject({
      ok: true,
      detail: {
        domSections: {
          skills: expect.arrayContaining([expect.objectContaining({ name: "Skill 097" })])
        }
      }
    });
    expect(browserMock.tabs.reload).toHaveBeenCalledWith(2, expect.any(Function));
    expect(browserMock.tabs.update).not.toHaveBeenCalledWith(2, { active: true });
    await waitForIdleDetailTabClose();
    expect(browserMock.tabs.remove).toHaveBeenCalledWith(2, expect.any(Function));
  });

  it("uses the sanitized RSC event bridge without replay globals", async () => {
    const requests: Array<Record<string, unknown>> = [];
    browserMock.tabs.sendMessage.mockResolvedValue({
      ok: true,
      detail: detailWithSkills(20)
    });
    browserMock.scripting.executeScript.mockImplementation(
      async (details: { func?: (...args: never[]) => unknown }) => {
        if (!details.func) return [];
        const onRequest = (event: Event) => {
          const detail = (event as CustomEvent).detail as Record<string, unknown>;
          requests.push(detail);
          window.dispatchEvent(
            new CustomEvent("lpe:s", {
              detail: {
                bridgeToken: "wrong-token",
                labels: ["Wrong Token Skill"],
                requestId: detail.requestId
              }
            })
          );
          window.dispatchEvent(
            new CustomEvent("lpe:s", {
              detail: {
                bridgeToken: detail.bridgeToken,
                labels: skillLabels(97),
                requestId: detail.requestId
              }
            })
          );
        };
        window.addEventListener("lpe:r", onRequest);
        try {
          return [{ result: await details.func("skills" as never, 97 as never, 200 as never) }];
        } finally {
          window.removeEventListener("lpe:r", onRequest);
        }
      }
    );

    const response = await sendRuntimeMessage({
      section: "skills",
      targetCount: 97,
      timeoutMs: 200,
      type: "recover-detail-section-tab",
      url: "https://www.linkedin.com/in/alex-rivera/details/skills/"
    });

    expect(response).toMatchObject({
      ok: true,
      detail: {
        domSections: {
          skills: expect.arrayContaining([expect.objectContaining({ name: "Skill 097" })])
        }
      }
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      bridgeToken: expect.any(String),
      section: "skills",
      targetCount: 97
    });
    expect(String(requests[0]?.bridgeToken).length).toBeGreaterThanOrEqual(16);
    expect(JSON.stringify(response)).not.toContain("Wrong Token Skill");
    expect(JSON.stringify(requests[0])).not.toContain("csrf");
    expect(JSON.stringify(requests[0])).not.toContain("body");
    expect(JSON.stringify(requests[0])).not.toContain("headers");
  });

  it("does not treat payload-only skills detail as complete when the target count is unmet", async () => {
    browserMock.tabs.sendMessage.mockResolvedValue({
      ok: true,
      detail: {
        diagnostics: [],
        payloads: [{ partial: true }]
      }
    });
    browserMock.scripting.executeScript.mockImplementation(async (details: { func?: unknown }) =>
      details.func ? [{ result: { labels: skillLabels(97) } }] : []
    );

    const response = await sendRuntimeMessage({
      section: "skills",
      targetCount: 97,
      timeoutMs: 200,
      type: "recover-detail-section-tab",
      url: "https://www.linkedin.com/in/alex-rivera/details/skills/"
    });

    expect(response).toMatchObject({
      ok: true,
      detail: {
        domSections: {
          skills: expect.arrayContaining([expect.objectContaining({ name: "Skill 097" })])
        }
      }
    });
    expect(browserMock.tabs.reload).toHaveBeenCalledWith(2, expect.any(Function));
    await waitForIdleDetailTabClose();
    expect(browserMock.tabs.remove).toHaveBeenCalledWith(2, expect.any(Function));
  });

  it("does not replace richer partial detail rows with a smaller RSC result", async () => {
    browserMock.tabs.sendMessage.mockResolvedValue({
      ok: true,
      detail: detailWithSkills(20)
    });
    browserMock.scripting.executeScript.mockImplementation(async (details: { func?: unknown }) =>
      details.func ? [{ result: { labels: ["Only RSC Skill"] } }] : []
    );

    const response = await sendRuntimeMessage({
      section: "skills",
      targetCount: 97,
      timeoutMs: 200,
      type: "recover-detail-section-tab",
      url: "https://www.linkedin.com/in/alex-rivera/details/skills/"
    });

    expect(response).toMatchObject({
      ok: true,
      detail: {
        domSections: {
          skills: expect.arrayContaining([expect.objectContaining({ name: "Skill 020" })])
        }
      }
    });
    expect(JSON.stringify(response)).not.toContain("Only RSC Skill");
    await waitForIdleDetailTabClose();
    expect(browserMock.tabs.remove).toHaveBeenCalledWith(2, expect.any(Function));
  });

  it("fails closed when the inactive detail tab never reaches the expected detail URL", async () => {
    browserMock.tabs.get.mockResolvedValue({
      id: 2,
      status: "complete",
      url: "https://www.linkedin.com/in/alex-rivera/details/courses/"
    });

    const response = await sendRuntimeMessage({
      section: "skills",
      targetCount: 97,
      timeoutMs: 50,
      type: "recover-detail-section-tab",
      url: "https://www.linkedin.com/in/alex-rivera/details/skills/"
    });

    expect(response).toMatchObject({
      ok: false,
      error: expect.stringContaining("Detail page did not finish loading")
    });
    expect(browserMock.tabs.sendMessage).not.toHaveBeenCalled();
    await waitForIdleDetailTabClose();
    expect(browserMock.tabs.remove).toHaveBeenCalledWith(2, expect.any(Function));
  });

  it("recovers course detail data from an inactive tab", async () => {
    browserMock.tabs.get.mockResolvedValue({
      id: 2,
      status: "complete",
      url: "https://www.linkedin.com/in/alex-rivera/details/courses/"
    });
    browserMock.tabs.sendMessage.mockResolvedValue({
      ok: true,
      detail: detailWithCourses(28)
    });

    const response = await sendRuntimeMessage({
      section: "courses",
      targetCount: 28,
      timeoutMs: 200,
      type: "recover-detail-section-tab",
      url: "https://www.linkedin.com/in/alex-rivera/details/courses/"
    });

    expect(response).toMatchObject({
      ok: true,
      detail: {
        domSections: {
          courses: expect.arrayContaining([expect.objectContaining({ name: "Course 028" })])
        }
      }
    });
    expect(browserMock.tabs.create).toHaveBeenCalledWith(
      {
        active: false,
        url: "https://www.linkedin.com/in/alex-rivera/details/courses/"
      },
      expect.any(Function)
    );
    await waitForIdleDetailTabClose();
    expect(browserMock.tabs.remove).toHaveBeenCalledWith(2, expect.any(Function));
  });

  it("reuses one inactive tab for queued same-profile detail sections", async () => {
    const skillsUrl = "https://www.linkedin.com/in/alex-rivera/details/skills/";
    const coursesUrl = "https://www.linkedin.com/in/alex-rivera/details/courses/";
    let detailTabUrl = skillsUrl;
    browserMock.tabs.create.mockImplementation(async (properties: { url?: string }) => {
      detailTabUrl = properties.url ?? detailTabUrl;
      return { id: 2, status: "complete", url: detailTabUrl };
    });
    browserMock.tabs.get.mockImplementation(async () => ({
      id: 2,
      status: "complete",
      url: detailTabUrl
    }));
    browserMock.tabs.update.mockImplementation(
      async (_tabId: number, properties: { url?: string }) => {
        detailTabUrl = properties.url ?? detailTabUrl;
        return { id: 2, status: "complete", url: detailTabUrl };
      }
    );
    browserMock.tabs.sendMessage.mockImplementation(
      async (_tabId: number, message: { section?: string }) => ({
        ok: true,
        detail: message.section === "courses" ? detailWithCourses(28) : detailWithSkills(97)
      })
    );

    const skillsRecovery = sendRuntimeMessage({
      section: "skills",
      targetCount: 97,
      timeoutMs: 500,
      type: "recover-detail-section-tab",
      url: skillsUrl
    });
    const coursesRecovery = sendRuntimeMessage({
      section: "courses",
      targetCount: 28,
      timeoutMs: 500,
      type: "recover-detail-section-tab",
      url: coursesUrl
    });

    await expect(skillsRecovery).resolves.toMatchObject({ ok: true });
    await expect(coursesRecovery).resolves.toMatchObject({ ok: true });

    expect(browserMock.tabs.create).toHaveBeenCalledTimes(1);
    expect(browserMock.tabs.update).toHaveBeenCalledWith(
      2,
      { url: coursesUrl },
      expect.any(Function)
    );
    expect(browserMock.tabs.update).not.toHaveBeenCalledWith(2, { active: true });
    await waitForIdleDetailTabClose();
    expect(browserMock.tabs.remove).toHaveBeenCalledTimes(1);
  });

  it("closes the inactive tab when detail messaging fails", async () => {
    browserMock.tabs.get.mockResolvedValue({
      id: 2,
      status: "complete",
      url: "https://www.linkedin.com/in/alex-rivera/details/featured/"
    });
    browserMock.tabs.sendMessage.mockRejectedValue(new Error("Receiving end does not exist."));

    const response = await sendRuntimeMessage({
      section: "featured",
      timeoutMs: 50,
      type: "recover-detail-section-tab",
      url: "https://www.linkedin.com/in/alex-rivera/details/featured/"
    });

    expect(response).toMatchObject({ ok: false });
    expect(browserMock.tabs.create).toHaveBeenCalledWith(
      {
        active: false,
        url: "https://www.linkedin.com/in/alex-rivera/details/featured/"
      },
      expect.any(Function)
    );
    await waitForIdleDetailTabClose();
    expect(browserMock.tabs.remove).toHaveBeenCalledWith(2, expect.any(Function));
  });
});

async function sendRuntimeMessage(message: unknown): Promise<unknown> {
  if (!listenerState.runtimeMessage) throw new Error("background listener was not registered");
  return new Promise((resolve) => {
    const immediate = listenerState.runtimeMessage?.(message, {}, resolve);
    if (immediate !== true && immediate !== undefined) resolve(immediate);
  });
}

async function waitForIdleDetailTabClose(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  await Promise.resolve();
}

function profileTab(id: number) {
  return {
    active: true,
    id,
    status: "complete",
    url: "https://www.linkedin.com/in/alex-rivera/"
  };
}

function detailWithSkills(count: number) {
  return {
    diagnostics: [],
    domSections: {
      skills: skillLabels(count).map((name) => ({ name }))
    },
    payloads: []
  };
}

function detailWithCourses(count: number) {
  return {
    diagnostics: [],
    domSections: {
      courses: Array.from({ length: count }, (_, index) => ({
        name: `Course ${String(index + 1).padStart(3, "0")}`
      }))
    },
    payloads: []
  };
}

function skillLabels(count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    index === 0 ? "TypeScript" : `Skill ${String(index + 1).padStart(3, "0")}`
  );
}
