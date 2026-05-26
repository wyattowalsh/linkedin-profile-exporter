import {
  detectLinkedInProfileReadiness,
  extractProfileFromDocument
} from "@linkedin-profile-exporter/core/extraction";
import { extractProfileFromVoyagerPayload } from "@linkedin-profile-exporter/core/linkedin-voyager";
import type { Profile } from "@linkedin-profile-exporter/core/schema";
import { applyProfileSettings, type Settings } from "@linkedin-profile-exporter/core/settings";
import { browser } from "wxt/browser";
import { defineContentScript } from "wxt/utils/define-content-script";
import type { RuntimeMessage, RuntimeResponse } from "../src/messaging";

export default defineContentScript({
  matches: ["https://www.linkedin.com/in/*"],
  runAt: "document_idle",
  main() {
    browser.runtime.onMessage.addListener((message: RuntimeMessage): Promise<RuntimeResponse> | undefined => {
      if (message.type === "profile-readiness") {
        return waitForProfileContent().then(() => ({ ok: true as const, readiness: detectLinkedInProfileReadiness(document) }));
      }
      if (message.type === "extract-profile") {
        return waitForProfileContent()
          .then(assertProfileReady)
          .then(() => prepareAccessibleSections(message.settings))
          .then(assertProfileReady)
          .then(() => extractProfile(message.settings))
          .then((profile) => ({ ok: true as const, profile: applyProfileSettings(profile, message.settings) }))
          .catch((error: unknown) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      }
      return undefined;
    });
  }
});

async function extractProfile(settings: Settings): Promise<Profile> {
  const voyager = await extractViaVoyagerApi();
  if (voyager) return voyager;
  const profile = extractProfileFromDocument(document, { settings });
  profile.diagnostics.push({
    code: "linkedin-voyager.unavailable",
    level: "warning",
    message: "LinkedIn internal profile JSON was unavailable, so DOM extraction was used.",
    source: "linkedin-voyager"
  });
  return profile;
}

async function extractViaVoyagerApi(): Promise<Profile | null> {
  const profileId = profileIdFromLocation();
  if (!profileId) return null;

  try {
    const profilePayload = await voyagerFetch(`/identity/profiles/${encodeURIComponent(profileId)}/profileView`);
    const supplementalPayloads = await Promise.all([
      voyagerFetchOptional(`/identity/profiles/${encodeURIComponent(profileId)}/skillCategory`),
      voyagerFetchOptional(`/identity/profiles/${encodeURIComponent(profileId)}/recommendations?q=received&recommendationStatuses=List(VISIBLE)`)
    ]);
    return extractProfileFromVoyagerPayload(profilePayload, {
      source: "linkedin-voyager.profileView",
      supplementalPayloads: supplementalPayloads.filter((payload): payload is unknown => Boolean(payload)),
      url: document.location.href
    });
  } catch {
    return null;
  }
}

async function voyagerFetchOptional(path: string): Promise<unknown | null> {
  try {
    return await voyagerFetch(path);
  } catch {
    return null;
  }
}

async function voyagerFetch(path: string): Promise<unknown> {
  const csrfToken = csrfTokenFromCookie();
  if (!csrfToken) throw new Error("LinkedIn session CSRF token is unavailable.");

  const url = path.startsWith("https://") ? path : `https://www.linkedin.com/voyager/api${path}`;
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      accept: "application/vnd.linkedin.normalized+json+2.1",
      "csrf-token": csrfToken
    },
    method: "GET",
    mode: "cors",
    referrer: document.location.href
  });
  if (!response.ok) throw new Error(`LinkedIn internal API returned ${response.status}.`);
  return response.json();
}

async function prepareAccessibleSections(settings: Settings): Promise<void> {
  if (settings.automationMode === "manual") return;
  if (settings.autoScroll) {
    for (let pass = 0; pass < 3; pass += 1) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await delay(75);
    }
    window.scrollTo(0, 0);
  }
  if (!settings.expandShowMore) return;

  const controls = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
    .filter(isSafeExpansionButton)
    .slice(0, 20);

  for (const control of controls) {
    control.click();
    await delay(50);
  }
}

function csrfTokenFromCookie(): string | undefined {
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("JSESSIONID="))
    ?.slice("JSESSIONID=".length)
    .replace(/^"|"$/g, "");
}

function profileIdFromLocation(): string | undefined {
  return document.location.href.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertProfileReady(): void {
  const readiness = detectLinkedInProfileReadiness(document);
  if (readiness.state !== "ready") throw new Error(readiness.reason);
}

function isSafeExpansionButton(control: HTMLButtonElement): boolean {
  if (control.disabled || control.getAttribute("aria-disabled") === "true") return false;
  if (control.closest("form")) return false;
  if (!/show more|see more|more results|show all/i.test(control.textContent ?? "")) return false;
  return control.getClientRects().length > 0;
}

async function waitForProfileContent(timeoutMs = 3500): Promise<void> {
  if (detectLinkedInProfileReadiness(document).state === "ready") return;
  if (!document.body) await delay(50);
  if (detectLinkedInProfileReadiness(document).state === "ready") return;

  await new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      if (detectLinkedInProfileReadiness(document).state === "ready") {
        window.clearTimeout(timeout);
        observer.disconnect();
        resolve();
      }
    });
    const timeout = window.setTimeout(() => {
      observer.disconnect();
      resolve();
    }, timeoutMs);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}
