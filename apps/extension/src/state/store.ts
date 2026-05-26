import { create } from "zustand";
import type { ReadinessResult } from "@linkedin-profile-exporter/core/extraction";
import type { ExportFormat, Profile } from "@linkedin-profile-exporter/core/schema";
import { defaultSettings, type Settings } from "@linkedin-profile-exporter/core/settings";

export interface ExtensionState {
  readiness: ReadinessResult | null;
  profile: Profile | null;
  settings: Settings;
  selectedFormats: ExportFormat[];
  diagnosticsOpen: boolean;
  setReadiness: (readiness: ReadinessResult) => void;
  setProfile: (profile: Profile | null) => void;
  setSettings: (settings: Settings) => void;
  toggleFormat: (format: ExportFormat) => void;
  clear: () => void;
  setDiagnosticsOpen: (open: boolean) => void;
}

export const useExtensionStore = create<ExtensionState>((set) => ({
  readiness: null,
  profile: null,
  settings: defaultSettings,
  selectedFormats: [...defaultSettings.outputFormats],
  diagnosticsOpen: false,
  setReadiness: (readiness) => set({ readiness }),
  setProfile: (profile) => set({ profile }),
  setSettings: (settings) => set({ settings, selectedFormats: settings.outputFormats }),
  toggleFormat: (format) =>
    set((state) => {
      const selectedFormats = state.selectedFormats.includes(format)
        ? state.selectedFormats.filter((item) => item !== format)
        : [...state.selectedFormats, format];
      return { selectedFormats: selectedFormats.length ? selectedFormats : state.selectedFormats };
    }),
  clear: () => set({ profile: null }),
  setDiagnosticsOpen: (diagnosticsOpen) => set({ diagnosticsOpen })
}));
