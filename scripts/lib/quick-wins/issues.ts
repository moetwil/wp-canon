import { isUtilityPage } from "./text";
import type { Issue, PageSignals } from "./types";

const MAX_METADATA_ITEMS = 10;
const MAX_STRUCTURE_ITEMS = 10;
const TITLE_MIN_LENGTH = 30;
const TITLE_MAX_LENGTH = 60;
const DESCRIPTION_MIN_LENGTH = 70;
const DESCRIPTION_MAX_LENGTH = 160;
const THIN_CONTENT_WORD_COUNT = 300;

export function getMetadataIssues(pages: PageSignals[]) {
  const hasFocusKeywordData = pages.some((page) => page.hasFocusKeywordField);
  const issues: Issue[] = [];

  for (const page of pages.filter((item) => !isUtilityPage(item))) {
    const title = page.metaTitle ?? page.title;
    const description = page.metaDescription;

    if (!title) {
      issues.push({
        page,
        issue: "Missing meta title",
        action: "Add a concise SEO title that includes the primary query.",
        score: 90,
      });
    } else if (title.length < TITLE_MIN_LENGTH) {
      issues.push({
        page,
        issue: `Meta title is short (${title.length} chars)`,
        action: `Expand the title toward ${TITLE_MIN_LENGTH}-${TITLE_MAX_LENGTH} characters while keeping the main topic early.`,
        score: 55,
      });
    } else if (title.length > TITLE_MAX_LENGTH) {
      issues.push({
        page,
        issue: `Meta title is long (${title.length} chars)`,
        action: `Shorten the title to ${TITLE_MAX_LENGTH} characters or less.`,
        score: 45,
      });
    }

    if (!description) {
      issues.push({
        page,
        issue: "Missing meta description",
        action: "Write a specific meta description with the page benefit and topic.",
        score: 80,
      });
    } else if (description.length < DESCRIPTION_MIN_LENGTH) {
      issues.push({
        page,
        issue: `Meta description is short (${description.length} chars)`,
        action: `Expand the description toward ${DESCRIPTION_MIN_LENGTH}-${DESCRIPTION_MAX_LENGTH} characters.`,
        score: 50,
      });
    } else if (description.length > DESCRIPTION_MAX_LENGTH) {
      issues.push({
        page,
        issue: `Meta description is long (${description.length} chars)`,
        action: `Trim the description to ${DESCRIPTION_MAX_LENGTH} characters or less.`,
        score: 40,
      });
    }

    if (hasFocusKeywordData && !page.focusKeyword) {
      issues.push({
        page,
        issue: "Missing focus keyword",
        action: "Add a focus keyword in the SEO plugin metadata.",
        score: 35,
      });
    }
  }

  return issues
    .sort((a, b) => b.score - a.score || (a.page.item.path ?? "").localeCompare(b.page.item.path ?? ""))
    .slice(0, MAX_METADATA_ITEMS);
}

export function getStructureIssues(pages: PageSignals[]) {
  const issues: Issue[] = [];

  for (const page of pages.filter((item) => !isUtilityPage(item))) {
    if (page.h1Count === 0) {
      issues.push({
        page,
        issue: "No H1 found in pulled content body",
        action: "Check whether the theme outputs the page title as H1; add one only if the live page lacks it.",
        score: 25,
      });
    }

    if (page.h2Count === 0 && page.wordCount >= 120) {
      issues.push({
        page,
        issue: "No H2 sections found",
        action: "Add descriptive H2 sections so the page is easier to scan and internally link to.",
        score: 45,
      });
    }

    if (page.wordCount > 0 && page.wordCount < THIN_CONTENT_WORD_COUNT) {
      issues.push({
        page,
        issue: `Thin content (${page.wordCount} words)`,
        action: `Expand the page above ${THIN_CONTENT_WORD_COUNT} words if it targets organic search.`,
        score: 60,
      });
    }
  }

  return issues
    .sort((a, b) => b.score - a.score || (a.page.item.path ?? "").localeCompare(b.page.item.path ?? ""))
    .slice(0, MAX_STRUCTURE_ITEMS);
}
