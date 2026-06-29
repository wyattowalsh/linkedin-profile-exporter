const JOINED_SENTENCE_BOUNDARY = /([a-z0-9%)\]][.!?])(?=(?:[A-Z][a-z]+|I(?:['’][a-z]+)?)(?:\s|$))/g;

export function normalizeReadableText(value: string): string {
  const compact = value.replace(/\s+/g, " ");
  return compact
    .replace(JOINED_SENTENCE_BOUNDARY, (match: string, boundary: string, offset: number) =>
      isInsideUrlToken(compact, offset) ? match : `${boundary} `
    )
    .trim();
}

export function cleanReadableText(value: string): string | undefined {
  const cleaned = normalizeReadableText(value);
  return cleaned || undefined;
}

function isInsideUrlToken(value: string, offset: number): boolean {
  const tokenStart = value.lastIndexOf(" ", offset) + 1;
  const nextSpace = value.indexOf(" ", offset);
  const tokenEnd = nextSpace === -1 ? value.length : nextSpace;
  const token = value.slice(tokenStart, tokenEnd);
  return /^(?:https?:\/\/|www\.)/i.test(token);
}
