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
    permissions: [
      "activeTab",
      "downloads",
      "storage",
      ...(browser === "chrome" || browser === "edge" ? ["sidePanel"] : [])
    ],
    host_permissions: ["https://www.linkedin.com/in/*"],
    action: {
      ...(browser === "chrome" || browser === "edge" ? { default_state: "disabled" as const } : {}),
      default_popup: "popup.html",
      default_title: "Open a LinkedIn profile to export",
      default_icon: {
        "16": "icon/16.png",
        "32": "icon/32.png",
        "48": "icon/48.png"
      }
    },
    options_ui: {
      page: "options.html",
      open_in_tab: true
    },
    ...(browser === "chrome" || browser === "edge"
      ? { side_panel: { default_path: "sidepanel.html" } }
      : {}),
    icons: {
      "16": "icon/16.png",
      "32": "icon/32.png",
      "48": "icon/48.png",
      "128": "icon/128.png"
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
