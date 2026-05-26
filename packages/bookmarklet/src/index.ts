import { EXPORT_FORMATS } from "@linkedin-profile-exporter/core";

export function createBookmarklet(): string {
  const supported = EXPORT_FORMATS.join(",");
  const code = `(() => {
  const state = document.querySelector('[data-lpe-profile], main');
  if (!/https:\\/\\/([a-z]{2,3}\\.)?www\\.linkedin\\.com\\/in\\//i.test(location.href)) {
    alert('LinkedIn Profile Exporter: open a LinkedIn profile page first.');
    return;
  }
  if (!state) {
    alert('LinkedIn Profile Exporter: accessible profile content was not found. Use the extension path.');
    return;
  }
  const name = document.querySelector('h1,[data-field="name"]')?.textContent?.trim() || 'LinkedIn Profile';
  const payload = {
    schemaVersion: 'linkedin-profile-exporter.profile.v1',
    identity: { name, profileUrl: location.href },
    metadata: { capturedAt: new Date().toISOString(), sourceUrl: location.href, generator: 'linkedin-profile-exporter-bookmarklet' },
    diagnostics: [{ code: 'bookmarklet.minimal', level: 'info', message: 'Bookmarklet fallback captured minimal profile data. Supported extension formats: ${supported}' }]
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.linkedin-profile.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
})();`;
  return `javascript:${encodeURIComponent(code)}`;
}

export function createInstallerHtml(): string {
  const bookmarklet = createBookmarklet();
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>LinkedIn Profile Exporter Bookmarklet</title></head>
  <body>
    <main>
      <h1>LinkedIn Profile Exporter Bookmarklet</h1>
      <p>Drag the link to your bookmarks bar. Use the extension for the full robust export path.</p>
      <a href="${bookmarklet}">Export LinkedIn Profile</a>
    </main>
  </body>
</html>`;
}
