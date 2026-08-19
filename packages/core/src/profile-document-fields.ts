import { cleanReadableText } from "./text";

export type RecommendationDirection = "received" | "given";
export type InterestKind = "topVoice" | "company" | "group" | "newsletter" | "school";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isLinkedInUrn(value: string): boolean {
  return /^urn:/i.test(value.trim());
}

function cleaned(value: unknown): string | undefined {
  if (typeof value === "string") return cleanReadableText(value);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const record = asRecord(value);
  if (!record) return undefined;
  return (
    cleaned(record.text) ??
    cleaned(record.localized) ??
    cleaned(record.name) ??
    cleaned(record.number)
  );
}

function imText(value: unknown): string | undefined {
  if (typeof value === "string") {
    const text = cleanReadableText(value);
    return text && !isLinkedInUrn(text) ? text : undefined;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const record = asRecord(value);
  if (!record) return undefined;
  const named =
    cleaned(record.imAccountName) ?? cleaned(record.username) ?? cleaned(record.handle);
  if (named) return named;
  const id = cleaned(record.id);
  if (id && !isLinkedInUrn(id)) return id;
  return cleaned(record.text) ?? cleaned(record.name);
}

function firstIm(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = firstIm(item);
      if (text) return text;
    }
    return undefined;
  }
  return imText(value);
}

function firstString(entity: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = entity[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        const text = cleaned(item);
        if (text) return text;
      }
      continue;
    }
    const text = cleaned(value);
    if (text) return text;
  }
  return undefined;
}

function hasSide(entity: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => {
    const value = entity[key];
    if (value === undefined || value === null || value === "") return false;
    if (typeof value === "string" && value.trim() === "") return false;
    return true;
  });
}

function personName(value: unknown): string | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const combined = [cleaned(record.firstName), cleaned(record.lastName)]
    .filter((part): part is string => Boolean(part))
    .join(" ");
  return combined || cleaned(record.name) || cleaned(record.fullName);
}

function formatBirthDate(value: unknown): string | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const year  = typeof record.year === "number" ? record.year : undefined;
  const month = typeof record.month === "number" ? record.month : undefined;
  const day   = typeof record.day === "number" ? record.day : undefined;
  if (year && month && day) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  if (year && month) return `${year}-${String(month).padStart(2, "0")}`;
  if (month && day) return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (year) return String(year);
  return undefined;
}

function usableCertDate(value?: string): string | undefined {
  const text = value?.trim();
  if (!text || /present/i.test(text)) return undefined;
  return text;
}

function recipeValues(entity: Record<string, unknown>): unknown[] {
  const values: unknown[] = [];
  for (const key of ["$recipeTypes", "$recipeType"]) {
    const raw = entity[key];
    if (Array.isArray(raw)) values.push(...raw);
    else if (raw !== undefined) values.push(raw);
  }
  return values;
}

export function interestKindFromUrl(url: string | undefined): InterestKind | undefined {
  if (!url) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (!/(^|\.)linkedin\.com$/i.test(parsed.hostname)) return undefined;
  const path = parsed.pathname;
  if (path.includes("/company/")) return "company";
  if (path.includes("/groups/")) return "group";
  if (path.includes("/newsletters/") || path.includes("/newsletter/")) return "newsletter";
  if (path.includes("/school/")) return "school";
  if (path.includes("/in/")) return "topVoice";
  return undefined;
}

export function recommendationDirection(
  entity: Record<string, unknown>
): RecommendationDirection | undefined {
  const type = firstString(entity, ["recommendationType", "type"]) ?? "";
  if (/given/i.test(type)) return "given";
  if (/received/i.test(type)) return "received";
  const hasRecommendee = hasSide(entity, ["recommendee", "*recommendee"]);
  const hasRecommender = hasSide(entity, ["recommender", "*recommender"]);
  if (hasRecommendee && !hasRecommender) return "given";
  if (hasRecommender && !hasRecommendee) return "received";
  return undefined;
}

export function recommendationDisplayName(
  entity: Record<string, unknown>,
  direction?: RecommendationDirection
): string {
  const givenName = personName(entity.recommendee);
  const receivedName = personName(entity.recommender);
  const name =
    direction === "given"
      ? givenName
      : direction === "received"
        ? receivedName
        : (receivedName ?? givenName);
  return name || "LinkedIn recommendation";
}

export function certificationDates(
  start?: string,
  end?: string
): { date?: string; expirationDate?: string } {
  const issue      = usableCertDate(start);
  const expiration = usableCertDate(end);
  if (issue && expiration && issue !== expiration) {
    return { date: issue, expirationDate: expiration };
  }
  if (issue) return { date: issue };
  if (expiration) return { date: expiration };
  return {};
}

export function careerBreakFromEntity(entity: Record<string, unknown>): string | undefined {
  const labeled = firstString(entity, ["careerBreak", "careerBreakType"]);
  if (labeled) return labeled;
  const type = firstString(entity, ["$type", "type", "$recipeType"]);
  if (type && /careerbreak/i.test(type)) return "Career break";
  if (recipeValues(entity).some((item) => /careerbreak/i.test(String(item)))) {
    return "Career break";
  }
  return undefined;
}

export function contactFromEntity(entity: Record<string, unknown>):
  | {
      email?: string;
      phone?: string;
      im?: string;
      birthday?: string;
      address?: string;
    }
  | undefined {
  const email = firstString(entity, ["email", "emailAddress"]);
  const phone = firstString(entity, ["phone", "phoneNumber", "phoneNumbers"]);
  const im = firstIm(entity.im) ?? firstIm(entity.ims);
  const birthday =
    firstString(entity, ["birthday"]) ?? formatBirthDate(entity.birthDateOn ?? entity.birthday);
  const address = firstString(entity, ["address"]);
  const contact = {
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(im ? { im } : {}),
    ...(birthday ? { birthday } : {}),
    ...(address ? { address } : {})
  };
  return Object.keys(contact).length ? contact : undefined;
}

export function stringListFromKeys(
  entity: Record<string, unknown>,
  keys: string[]
): string[] | undefined {
  const values: string[] = [];
  const seen = new Set<string>();
  for (const key of keys) {
    const raw = entity[key];
    const items = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
    for (const item of items) {
      const text = cleaned(item);
      if (text && !seen.has(text)) {
        seen.add(text);
        values.push(text);
      }
    }
  }
  const includesOpenTo = keys.some((key) => key === "openTo" || key === "openToStatus");
  if (includesOpenTo && entity.openToWork === true && !seen.has("Open to work")) {
    values.unshift("Open to work");
  }
  return values.length ? values : undefined;
}

export function parseRecommendationDirectionField(
  value: string | undefined
): RecommendationDirection | undefined {
  return value === "received" || value === "given" ? value : undefined;
}

export function parseInterestKindField(value: string | undefined): InterestKind | undefined {
  return value === "topVoice" ||
    value === "company" ||
    value === "group" ||
    value === "newsletter" ||
    value === "school"
    ? value
    : undefined;
}
