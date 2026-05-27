import { mkdir, readFile, writeFile } from "fs/promises";
import matter from "gray-matter";

const OUTPUT_PATH = "reports/quick-wins.md";
const MAX_TOP_ITEMS = 10;
const MAX_LINK_OPPORTUNITIES = 10;
const MAX_ORPHAN_ITEMS = 10;
const MAX_METADATA_ITEMS = 10;
const MAX_STRUCTURE_ITEMS = 10;
const MIN_LINK_RELEVANCE_SCORE = 60;
const LOW_INBOUND_LINK_COUNT = 1;
const TITLE_MIN_LENGTH = 30;
const TITLE_MAX_LENGTH = 60;
const DESCRIPTION_MIN_LENGTH = 70;
const DESCRIPTION_MAX_LENGTH = 160;
const THIN_CONTENT_WORD_COUNT = 300;

type LinkOpportunity = {
  target?: string;
  reason?: string;
  relevanceScore?: number;
  suggestedAnchors?: string[];
};

type IndexItem = {
  title?: string;
  slug?: string;
  type?: string;
  restBase?: string;
  status?: string;
  path?: string;
  terms?: Array<{ taxonomy?: string; name?: string; slug?: string }>;
  internalLinks?: string[];
  linkedFrom?: string[];
  brokenInternalLinks?: string[];
  linkOpportunities?: LinkOpportunity[];
  contentKeywords?: string[];
  semanticCluster?: string;
  hubScore?: number;
  orphan?: boolean;
};

type ContentIndex = {
  items?: IndexItem[];
};

type PageSignals = {
  item: IndexItem;
  url?: string;
  title: string;
  body: string;
  metaTitle?: string;
  metaDescription?: string;
  focusKeyword?: string;
  hasExplicitMetaTitle: boolean;
  hasExplicitMetaDescription: boolean;
  hasFocusKeywordField: boolean;
  h1Count: number;
  h2Count: number;
  wordCount: number;
};

type RankedOpportunity = LinkOpportunity & {
  source: PageSignals;
  targetPage?: PageSignals;
  preferredAnchor?: string;
};

type Issue = {
  page: PageSignals;
  issue: string;
  action: string;
  score: number;
};

type PriorityItem = {
  title: string;
  action: string;
  score: number;
  ease: string;
};

const UTILITY_PATTERNS = [
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

function cleanText(value: unknown) {
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

function normalizeKeyword(value: string) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getStringValue(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = data[key];

    if (typeof value === "string" && value.trim()) {
      return cleanText(value);
    }
  }

  return undefined;
}

function hasAnyKey(data: Record<string, unknown>, keys: string[]) {
  return keys.some((key) => key in data);
}

function wordCount(content: string) {
  return cleanText(content)
    .split(/[^a-zA-Z0-9À-ÿ]+/i)
    .filter((word) => word.length > 1 && !/^\d+$/.test(word)).length;
}

function countHeadings(content: string, level: 1 | 2) {
  const htmlMatches = content.match(new RegExp(`<h${level}\\b`, "gi")) ?? [];
  const markdownMatches = content.match(new RegExp(`^#{${level}}\\s+`, "gim")) ?? [];

  return htmlMatches.length + markdownMatches.length;
}

function itemSearchValue(page: Pick<PageSignals, "item" | "title">) {
  const item = page.item;

  return `${item.type ?? ""} ${item.restBase ?? ""} ${item.slug ?? ""} ${
    page.title ?? ""
  } ${item.path ?? ""}`.toLowerCase();
}

function includesPattern(value: string, pattern: string) {
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

function isUtilityPage(page: Pick<PageSignals, "item" | "title">) {
  const value = itemSearchValue(page);

  return UTILITY_PATTERNS.some((pattern) => includesPattern(value, pattern));
}

function sameTarget(target: string | undefined, page: PageSignals) {
  if (!target) {
    return false;
  }

  const targetValue = target.toLowerCase();

  return (
    Boolean(page.url && targetValue === page.url.toLowerCase()) ||
    Boolean(page.item.slug && targetValue.includes(`/${page.item.slug}`))
  );
}

function naturalAnchor(anchor: string) {
  const cleanAnchor = cleanText(anchor);
  const words = cleanAnchor.split(/\s+/).filter(Boolean);

  if (!cleanAnchor || cleanAnchor.length > 60 || words.length === 0) {
    return "";
  }

  if (words.length >= 3 && !/[A-ZÀ-Ý]/.test(cleanAnchor) && !/[&'’]/.test(cleanAnchor)) {
    return "";
  }

  if (words.length < 3 && cleanAnchor.length < 8) {
    return "";
  }

  return cleanAnchor;
}

function slugAnchor(slug?: string) {
  return naturalAnchor(String(slug ?? "").replace(/[-_]+/g, " "));
}

function getPreferredAnchor(opportunity: LinkOpportunity, target?: PageSignals) {
  const candidates = [
    target?.title,
    slugAnchor(target?.item.slug),
    ...(opportunity.suggestedAnchors ?? []),
  ];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const anchor = naturalAnchor(String(candidate ?? ""));
    const key = normalizeKeyword(anchor);

    if (anchor && !seen.has(key)) {
      seen.add(key);
      return anchor;
    }
  }

  return target?.title ?? "";
}

function getTargetPage(target: string | undefined, pages: PageSignals[]) {
  return pages.find((page) => sameTarget(target, page));
}

function getTopLinkOpportunities(pages: PageSignals[]) {
  const seenSources = new Set<string>();

  return pages
    .filter((page) => !isUtilityPage(page))
    .flatMap((source) => {
      return (source.item.linkOpportunities ?? []).map((opportunity) => {
        const targetPage = getTargetPage(opportunity.target, pages);

        return {
          ...opportunity,
          source,
          targetPage,
          preferredAnchor: getPreferredAnchor(opportunity, targetPage),
        };
      });
    })
    .filter((opportunity) => {
      return (
        (opportunity.relevanceScore ?? 0) >= MIN_LINK_RELEVANCE_SCORE &&
        !isUtilityPage(opportunity.targetPage ?? opportunity.source) &&
        Boolean(opportunity.preferredAnchor)
      );
    })
    .sort((a, b) => {
      return (
        (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0) ||
        (a.source.item.path ?? "").localeCompare(b.source.item.path ?? "")
      );
    })
    .filter((opportunity) => {
      const source = opportunity.source.item.path ?? "";

      if (seenSources.has(source)) {
        return false;
      }

      seenSources.add(source);
      return true;
    })
    .slice(0, MAX_LINK_OPPORTUNITIES);
}

function getSuggestedSources(target: PageSignals, pages: PageSignals[]) {
  const directOpportunities = pages
    .flatMap((source) => {
      return (source.item.linkOpportunities ?? []).flatMap((opportunity) => {
        return sameTarget(opportunity.target, target)
          ? [{ source, score: opportunity.relevanceScore ?? 0 }]
          : [];
      });
    })
    .filter(({ source }) => source.item.path !== target.item.path && !isUtilityPage(source));

  const fallbackCluster = pages
    .filter((source) => {
      return (
        source.item.path !== target.item.path &&
        source.item.semanticCluster === target.item.semanticCluster &&
        !isUtilityPage(source)
      );
    })
    .map((source) => ({ source, score: source.item.hubScore ?? 0 }));

  const seen = new Set<string>();

  return [...directOpportunities, ...fallbackCluster]
    .sort((a, b) => b.score - a.score || (a.source.item.path ?? "").localeCompare(b.source.item.path ?? ""))
    .filter(({ source }) => {
      const path = source.item.path ?? "";

      if (seen.has(path)) {
        return false;
      }

      seen.add(path);
      return true;
    })
    .slice(0, 3)
    .map(({ source }) => source);
}

function getWeakLinkedPages(pages: PageSignals[]) {
  return pages
    .filter((page) => {
      return !isUtilityPage(page) && (page.item.linkedFrom?.length ?? 0) <= LOW_INBOUND_LINK_COUNT;
    })
    .sort((a, b) => {
      return (
        Number(b.item.orphan === true) - Number(a.item.orphan === true) ||
        (a.item.linkedFrom?.length ?? 0) - (b.item.linkedFrom?.length ?? 0) ||
        (b.item.hubScore ?? 0) - (a.item.hubScore ?? 0)
      );
    })
    .slice(0, MAX_ORPHAN_ITEMS);
}

function getMetadataIssues(pages: PageSignals[]) {
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

function getStructureIssues(pages: PageSignals[]) {
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

function topPriorities(
  opportunities: RankedOpportunity[],
  weakPages: PageSignals[],
  metadataIssues: Issue[],
  structureIssues: Issue[],
  allPages: PageSignals[]
) {
  const items: PriorityItem[] = [
    ...opportunities.slice(0, 4).map((opportunity) => {
      return {
        title: `Add internal link: ${opportunity.source.title} -> ${opportunity.targetPage?.title ?? opportunity.target ?? "target"}`,
        action: `Use anchor "${opportunity.preferredAnchor}" from ${opportunity.source.item.path} to ${opportunity.targetPage?.url ?? opportunity.target}.`,
        score: 80 + Math.min(opportunity.relevanceScore ?? 0, 100) / 5,
        ease: "Easy",
      };
    }),
    ...weakPages.slice(0, 4).map((page) => {
      const sources = getSuggestedSources(page, allPages).map((source) => source.title);

      return {
        title: `Add inbound links to ${page.title}`,
        action:
          sources.length > 0
            ? `Link from: ${sources.join(", ")}.`
            : `Find a relevant hub or related article and link to ${page.url ?? page.item.path}.`,
        score: page.item.orphan ? 75 : 55,
        ease: "Medium",
      };
    }),
    ...metadataIssues.slice(0, 4).map((issue) => {
      return {
        title: `${issue.issue}: ${issue.page.title}`,
        action: issue.action,
        score: issue.score,
        ease: "Easy",
      };
    }),
    ...structureIssues.slice(0, 4).map((issue) => {
      return {
        title: `${issue.issue}: ${issue.page.title}`,
        action: issue.action,
        score: issue.score,
        ease: issue.issue.startsWith("Thin content") ? "Medium" : "Easy",
      };
    }),
  ];

  // Favor fixes that combine SEO impact with low implementation effort, then
  // keep one recommendation per title so the final list stays practical.
  const easeBonus: Record<string, number> = { Easy: 10, Medium: 5 };
  const seen = new Set<string>();

  return items
    .sort((a, b) => b.score + (easeBonus[b.ease] ?? 0) - (a.score + (easeBonus[a.ease] ?? 0)))
    .filter((item) => {
      const key = normalizeKeyword(item.title);

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, MAX_TOP_ITEMS);
}

function bulletList(items: string[]) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None found.";
}

function renderLinkOpportunities(opportunities: RankedOpportunity[]) {
  return bulletList(
    opportunities.map((opportunity) => {
      return `Source: ${opportunity.source.item.path} | Target: ${
        opportunity.targetPage?.item.path ?? opportunity.targetPage?.url ?? opportunity.target ?? "unknown"
      } | Anchor: "${opportunity.preferredAnchor}" | Score: ${
        opportunity.relevanceScore ?? "unknown"
      }${opportunity.reason ? ` | Reason: ${opportunity.reason}` : ""}`;
    })
  );
}

function renderWeakPages(pages: PageSignals[], allPages: PageSignals[]) {
  return bulletList(
    pages.map((page) => {
      const sources = getSuggestedSources(page, allPages);
      const sourceText =
        sources.length > 0
          ? sources.map((source) => `${source.title} (${source.item.path})`).join("; ")
          : "No close source found; choose a relevant hub or related article.";

      return `${page.title} (${page.item.path}, ${page.url ?? "no URL"}) | Incoming links: ${
        page.item.linkedFrom?.length ?? 0
      } | Suggested sources: ${sourceText}`;
    })
  );
}

function renderIssues(issues: Issue[]) {
  return bulletList(
    issues.map((issue) => {
      return `${issue.page.title} (${issue.page.item.path}) | ${issue.issue} | ${issue.action}`;
    })
  );
}

function renderPriorities(priorities: PriorityItem[]) {
  if (priorities.length === 0) {
    return "- None found.";
  }

  return priorities
    .map((item, index) => {
      return `${index + 1}. ${item.title}\n   - ${item.action}\n   - Ease: ${item.ease}`;
    })
    .join("\n");
}

async function loadPageSignals(item: IndexItem): Promise<PageSignals> {
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

  return {
    item,
    url: typeof data.link === "string" ? data.link : undefined,
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

function renderReport(pages: PageSignals[]) {
  const contentPages = pages.filter((page) => !isUtilityPage(page));
  const opportunities = getTopLinkOpportunities(contentPages);
  const weakPages = getWeakLinkedPages(contentPages);
  const metadataIssues = getMetadataIssues(contentPages);
  const structureIssues = getStructureIssues(contentPages);
  const priorities = topPriorities(
    opportunities,
    weakPages,
    metadataIssues,
    structureIssues,
    contentPages
  );
  const focusKeywordAvailable = pages.some((page) => page.hasFocusKeywordField);
  const explicitMetaTitles = pages.filter((page) => page.hasExplicitMetaTitle).length;
  const explicitMetaDescriptions = pages.filter((page) => page.hasExplicitMetaDescription).length;

  return `# Quick Wins

Generated from \`data/content-index.json\` and local files in \`content/\`.

## Summary

- Indexed pages reviewed: ${pages.length}
- SEO/content pages reviewed: ${contentPages.length}
- Utility/legal/system pages skipped from recommendations: ${pages.length - contentPages.length}
- Strong internal link opportunities: ${opportunities.length}
- Orphan or low-internal-link pages: ${weakPages.length}
- Metadata issues: ${metadataIssues.length}
- Content structure issues: ${structureIssues.length}
- Explicit SEO titles found: ${explicitMetaTitles}
- Explicit SEO descriptions found: ${explicitMetaDescriptions}
- Focus keyword metadata available: ${focusKeywordAvailable ? "yes" : "no"}

## Top Internal Link Opportunities

${renderLinkOpportunities(opportunities)}

## Orphan Or Low-Internal-Link Pages

${renderWeakPages(weakPages, contentPages)}

## Weak Or Missing SEO Metadata

${renderIssues(metadataIssues)}

## Content Structure Issues

${renderIssues(structureIssues)}

## Do These First

${renderPriorities(priorities)}

## Notes

- Metadata checks use explicit SEO plugin fields when present, otherwise WordPress title/excerpt as local fallbacks.
- H1 detection only checks the pulled content body. Many WordPress themes output the page title as the live H1 outside the REST content body.
- Legal/system pages are filtered by obvious slug/path/title patterns such as cookie, privacy, disclaimer, terms, thank-you, account, author, and search.
`;
}

async function main() {
  const index = JSON.parse(
    await readFile("data/content-index.json", "utf8")
  ) as ContentIndex;
  const pages = await Promise.all((index.items ?? []).map(loadPageSignals));

  await mkdir("reports", { recursive: true });
  await writeFile(OUTPUT_PATH, renderReport(pages));

  console.log(`Saved ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
