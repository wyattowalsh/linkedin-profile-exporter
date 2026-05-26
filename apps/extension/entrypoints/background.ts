import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { profileToDownload } from "../src/export-download";
import type { RuntimeMessage, RuntimeResponse } from "../src/messaging";

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: RuntimeMessage): Promise<RuntimeResponse> | undefined => {
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
      .catch((error: unknown) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  });
});
