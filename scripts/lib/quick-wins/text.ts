import type { PageSignals } from "./types";

export const UTILITY_PATTERNS = [
  "404",
  "account",
  "admin",
  "algemene-voorwaarden",
  "author",
  "auteur",
  "bedankt",
  "cart",
  "checkout",
  "cookie",
  "cookies",
  "disclaimer",
  "login",
  "logout",
  "mijn-account",
  "privacy",
  "search",
  "sitemap",
  "tag",
  "thank-you",
  "thankyou",
  "thanks",
  "terms",
  "voorwaarden",
  "winkelwagen",
];

export const META_TITLE_KEYS = [
  "metaTitle",
  "seoTitle",
  "seo_title",
  "yoastTitle",
  "rank_math_title",
  "_yoast_wpseo_title",
];
export const META_DESCRIPTION_KEYS = [
  "metaDescription",
  "seoDescription",
  "seo_description",
  "yoastDescription",
  "rank_math_description",
  "_yoast_wpseo_metadesc",
];
export const FOCUS_KEYWORD_KEYS = [
  "focusKeyword",
  "focus_keyword",
  "yoastFocusKeyword",
  "rank_math_focus_keyword",
  "_yoast_wpseo_focuskw",
];

export function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    )
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&hellip;/gi, "...")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeKeyword(value: string) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function getStringValue(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = data[key];

    if (typeof value === "string" && value.trim()) {
      return cleanText(value);
    }
  }

  return undefined;
}

export function hasAnyKey(data: Record<string, unknown>, keys: string[]) {
  return keys.some((key) => key in data);
}

export function wordCount(content: string) {
  return cleanText(content)
    .split(/[^a-zA-Z0-9À-ÿ]+/i)
    .filter((word) => word.length > 1 && !/^\d+$/.test(word)).length;
}

export function countHeadings(content: string, level: 1 | 2) {
  const htmlMatches = content.match(new RegExp(`<h${level}\\b`, "gi")) ?? [];
  const markdownMatches = content.match(new RegExp(`^#{${level}}\\s+`, "gim")) ?? [];

  return htmlMatches.length + markdownMatches.length;
}

export function itemSearchValue(page: Pick<PageSignals, "item" | "title">) {
  const item = page.item;

  return `${item.type ?? ""} ${item.restBase ?? ""} ${item.slug ?? ""} ${
    page.title ?? ""
  } ${item.path ?? ""}`.toLowerCase();
}

export function includesPattern(value: string, pattern: string) {
  return (
    value === pattern ||
    value.includes(`/${pattern}`) ||
    value.includes(`${pattern}/`) ||
    value.includes(`-${pattern}`) ||
    value.includes(`${pattern}-`) ||
    value.includes(` ${pattern}`) ||
    value.includes(`${pattern} `)
  );
}

export function isUtilityPage(page: Pick<PageSignals, "item" | "title">) {
  const value = itemSearchValue(page);

  return UTILITY_PATTERNS.some((pattern) => includesPattern(value, pattern));
}

export function sameTarget(target: string | undefined, page: PageSignals) {
  if (!target) {
    return false;
  }

  const targetValue = target.toLowerCase();

  return (
    Boolean(page.url && targetValue === page.url.toLowerCase()) ||
    Boolean(page.item.slug && targetValue.includes(`/${page.item.slug}`))
  );
}

export function canonicalUrl(value?: string) {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";

    return url.href.replace(/\/$/, "").toLowerCase();
  } catch {
    return value.replace(/[?#].*$/, "").replace(/\/$/, "").toLowerCase();
  }
}

export function samePage(first: PageSignals, second?: PageSignals) {
  if (!second) {
    return false;
  }

  return (
    Boolean(first.item.path && first.item.path === second.item.path) ||
    Boolean(first.item.slug && first.item.slug === second.item.slug) ||
    Boolean(first.url && first.url === second.url) ||
    Boolean(first.canonicalUrl && first.canonicalUrl === second.canonicalUrl)
  );
}

export function truncateContext(value: string) {
  const text = cleanText(value);

  if (text.length <= 220) {
    return text;
  }

  const truncated = text.slice(0, 217);
  const lastSpace = truncated.lastIndexOf(" ");

  return `${truncated.slice(0, lastSpace > 120 ? lastSpace : 217)}...`;
}
