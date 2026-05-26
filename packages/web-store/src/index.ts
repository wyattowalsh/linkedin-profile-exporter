export const webStoreTargets = ["chrome", "edge", "firefox", "safari", "mobile-safari", "mobile-chrome"] as const;
export type WebStoreTarget = (typeof webStoreTargets)[number];

export interface StoreListingMetadata {
  target: WebStoreTarget;
  status: "source-managed" | "packaging-path";
  categories: string[];
  submission: "not-in-v0.1.0";
}
