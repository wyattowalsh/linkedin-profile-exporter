export function createExtractionRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `extract-${Date.now()}-${Math.random()}`;
}
