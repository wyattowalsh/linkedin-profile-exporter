import { defineConfig } from "wxt";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: ".",
  manifest: ({ browser }) => ({
    name: "LinkedIn Profile Exporter",
    short_name: "Profile Exporter",
    description: "Extract accessible LinkedIn profile data locally and export structured files.",
    version: "0.1.0",
    permissions: ["activeTab", "downloads", "storage", ...(browser === "chrome" || browser === "edge" ? ["sidePanel"] : [])],
    host_permissions: ["https://www.linkedin.com/in/*"],
    action: {
      default_title: "Export LinkedIn profile"
    },
    options_ui: {
      page: "options.html",
      open_in_tab: true
    },
    ...(browser === "chrome" || browser === "edge" ? { side_panel: { default_path: "sidepanel.html" } } : {}),
    icons: {
      "16": "icon/16.svg",
      "48": "icon/48.svg",
      "128": "icon/128.svg"
    },
    browser_specific_settings: {
      gecko: {
        id: "linkedin-profile-exporter@example.local",
        data_collection_permissions: {
          required: ["none"]
        },
        strict_min_version: "128.0"
      }
    }
  }),
  vite: () => ({
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": new URL(".", import.meta.url).pathname
      }
    }
  })
});
