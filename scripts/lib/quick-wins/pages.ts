import { readFile } from "fs/promises";
import matter from "gray-matter";
import {
  canonicalUrl,
  cleanText,
  countHeadings,
  getStringValue,
  hasAnyKey,
  wordCount,
} from "./text";
import type { IndexItem, PageSignals } from "./types";

const META_TITLE_KEYS = [
  "metaTitle",
  "seoTitle",
  "seo_title",
  "yoastTitle",
  "rank_math_title",
  "_yoast_wpseo_title",
];
const META_DESCRIPTION_KEYS = [
  "metaDescription",
  "seoDescription",
  "seo_description",
  "yoastDescription",
  "rank_math_description",
  "_yoast_wpseo_metadesc",
];
const FOCUS_KEYWORD_KEYS = [
  "focusKeyword",
  "focus_keyword",
  "yoastFocusKeyword",
  "rank_math_focus_keyword",
  "_yoast_wpseo_focuskw",
];

export async function loadPageSignals(item: IndexItem): Promise<PageSignals> {
  if (!item.path) {
    return {
      item,
      title: cleanText(item.title ?? "Untitled"),
      body: "",
      h1Count: 0,
      h2Count: 0,
      wordCount: 0,
      hasExplicitMetaTitle: false,
      hasExplicitMetaDescription: false,
      hasFocusKeywordField: false,
    };
  }

  const file = await readFile(item.path, "utf8");
  const parsed = matter(file);
  const data = parsed.data as Record<string, unknown>;
  const explicitMetaTitle = getStringValue(data, META_TITLE_KEYS);
  const explicitMetaDescription = getStringValue(data, META_DESCRIPTION_KEYS);
  const excerpt = typeof data.excerpt === "string" ? cleanText(data.excerpt) : undefined;
  const title = cleanText(String(data.title ?? item.title ?? item.slug ?? item.path));
  const url = typeof data.link === "string" ? data.link : undefined;

  return {
    item,
    url,
    canonicalUrl: canonicalUrl(url),
    title,
    body: parsed.content,
    metaTitle: explicitMetaTitle ?? title,
    metaDescription: explicitMetaDescription ?? excerpt,
    focusKeyword: getStringValue(data, FOCUS_KEYWORD_KEYS),
    hasExplicitMetaTitle: Boolean(explicitMetaTitle),
    hasExplicitMetaDescription: Boolean(explicitMetaDescription),
    hasFocusKeywordField: hasAnyKey(data, FOCUS_KEYWORD_KEYS),
    h1Count: countHeadings(parsed.content, 1),
    h2Count: countHeadings(parsed.content, 2),
    wordCount: wordCount(parsed.content),
  };
}
