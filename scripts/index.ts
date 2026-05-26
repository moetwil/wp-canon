import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import dotenv from "dotenv";
import matter from "gray-matter";

dotenv.config({ quiet: true });

const WP_URL = process.env.WP_URL;
const BUILT_IN_STOPWORDS = [
  "a",
  "about",
  "all",
  "an",
  "and",
  "because",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "then",
  "this",
  "to",
  "with",
  "your",
];
const BUILT_IN_WEAK_TERMS = [
  "aanbevolen",
  "andere",
  "article",
  "beginnen",
  "belangrijk",
  "belangrijkste",
  "beter",
  "duidelijk",
  "echt",
  "content",
  "hebben",
  "helpen",
  "helpt",
  "hoeveel",
  "hoeveelheid",
  "houden",
  "klacht",
  "klachten",
  "komen",
  "komt",
  "maken",
  "meest",
  "meestal",
  "meer",
  "mijn",
  "moet",
  "opletten",
  "page",
  "passen",
  "patroon",
  "per",
  "post",
  "prettig",
  "rustig",
  "stap",
  "uitleg",
  "vaak",
  "video",
  "voelen",
  "voelt",
  "voel",
  "zijn",
];
const BUILT_IN_EXCLUDE_FROM_OPPORTUNITIES = [
  "privacy",
  "cookie",
  "cookies",
  "disclaimer",
  "terms",
  "voorwaarden",
];
const GENERIC_ANCHORS = new Set(["klik hier", "lees meer", "hier"]);
let stopwords = new Set(BUILT_IN_STOPWORDS);
let weakTerms = new Set(BUILT_IN_WEAK_TERMS);
let excludeFromOpportunities = new Set(BUILT_IN_EXCLUDE_FROM_OPPORTUNITIES);

function comparableHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function normalizeInternalUrl(value: string, siteUrl: string) {
  const site = new URL(siteUrl);
  const url = new URL(value, `${site.origin}/`);

  if (comparableHostname(url.hostname) !== comparableHostname(site.hostname)) {
    return null;
  }

  url.protocol = site.protocol;
  url.host = site.host;

  return url.href;
}

function comparableUrl(value: string, siteUrl: string) {
  const normalized = normalizeInternalUrl(value, siteUrl);

  if (!normalized) {
    return null;
  }

  const url = new URL(normalized);
  url.hash = "";

  return url.href;
}

function isIgnorableInternalUrl(value: string) {
  const url = new URL(value);
  const path = url.pathname.toLowerCase();

  if (
    path.startsWith("/wp-admin/") ||
    path === "/wp-login.php" ||
    path.startsWith("/wp-json/") ||
    path.startsWith("/wp-content/") ||
    path.startsWith("/wp-includes/") ||
    path.endsWith("/feed/") ||
    path === "/feed/"
  ) {
    return true;
  }

  return (
    url.searchParams.has("preview") ||
    url.searchParams.has("p") ||
    url.searchParams.has("page_id") ||
    url.searchParams.has("attachment_id")
  );
}

function isAssetUrl(value: string) {
  const url = new URL(value);
  const path = url.pathname.toLowerCase();

  return (
    path.startsWith("/wp-content/uploads/") ||
    /\.(jpe?g|png|gif|webp|svg|pdf|zip|docx?)$/.test(path)
  );
}

function extractInternalLinks(content: string, siteUrl: string) {
  const links = new Set<string>();
  const hrefPattern = /href=(["'])(.*?)\1/gi;
  const absolutePattern = /https?:\/\/[^\s"'<>]+/g;

  for (const match of content.matchAll(hrefPattern)) {
    links.add(match[2]);
  }

  for (const match of content.matchAll(absolutePattern)) {
    links.add(match[0]);
  }

  return Array.from(links).flatMap((link) => {
    const value = link.trim();
    const lowerValue = value.toLowerCase();

    if (
      !value ||
      value.startsWith("#") ||
      lowerValue.startsWith("mailto:") ||
      lowerValue.startsWith("tel:") ||
      lowerValue.startsWith("javascript:")
    ) {
      return [];
    }

    try {
      const url = normalizeInternalUrl(value, siteUrl);

      return url && !isAssetUrl(url) ? [url] : [];
    } catch {
      return [];
    }
  });
}

async function readJson(path: string, fallback: any) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function findMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = `${dir}/${entry.name}`;

    if (entry.isDirectory()) {
      files.push(...(await findMarkdownFiles(path)));
    } else if (entry.name !== ".gitkeep" && entry.name.endsWith(".md")) {
      files.push(path);
    }
  }

  return files;
}

function getRawTerms(data: any) {
  return {
    category: data.categories ?? [],
    post_tag: data.tags ?? [],
    ...(data.taxonomies ?? {}),
  };
}

function normalizeKeyword(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeKeywordList(values: string[]) {
  return values.map(normalizeKeyword).filter(Boolean);
}

async function loadSemanticConfig() {
  const config = await readJson("config/semantic.json", {
    stopwords: [],
    weakTerms: [],
    excludeFromOpportunities: [],
  });

  stopwords = new Set([
    ...BUILT_IN_STOPWORDS,
    ...normalizeKeywordList(config.stopwords ?? []),
  ]);
  weakTerms = new Set([
    ...BUILT_IN_WEAK_TERMS,
    ...normalizeKeywordList(config.weakTerms ?? []),
  ]);
  excludeFromOpportunities = new Set([
    ...BUILT_IN_EXCLUDE_FROM_OPPORTUNITIES,
    ...normalizeKeywordList(config.excludeFromOpportunities ?? []),
  ]);
}

function getKeywords(value: string) {
  return new Set(
    String(value ?? "")
      .replace(/<[^>]*>/g, "")
      .split(/[^a-zA-Z0-9À-ÿ]+/i)
      .map(normalizeKeyword)
      .filter((word) => {
        return word.length > 2 && !/^\d+$/.test(word) && !stopwords.has(word);
      })
  );
}

function extractHeadings(content: string) {
  return Array.from(content.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi)).map(
    (match) => match[1].replace(/<[^>]*>/g, " ")
  );
}

function stripHtml(content: string) {
  return content.replace(/<[^>]*>/g, " ");
}

function cleanText(value: string) {
  return stripHtml(value)
    .replace(/\s+/g, " ")
    .trim();
}

function addWeightedKeywords(
  scores: Map<string, number>,
  value: string,
  weight: number
) {
  for (const keyword of getKeywords(value)) {
    scores.set(keyword, (scores.get(keyword) ?? 0) + weight);
  }
}

function getContentKeywords(item: any, content: string) {
  const scores = new Map<string, number>();

  addWeightedKeywords(scores, item.title, 4);
  addWeightedKeywords(scores, item.slug, 4);

  for (const heading of extractHeadings(content)) {
    addWeightedKeywords(scores, heading, 3);
  }

  addWeightedKeywords(scores, stripHtml(content), 0.5);

  for (const term of item.terms) {
    addWeightedKeywords(scores, term.name ?? term.slug, 2);
  }

  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 15)
    .map(([keyword]) => keyword);
}

function getHeadingKeywordOverlap(target: any, keywords: string[]) {
  return target.headings.filter((heading: string) => {
    const headingKeywords = getKeywords(heading);

    return keywords.some((keyword) => headingKeywords.has(keyword));
  });
}

function getTermKeys(item: any) {
  return new Set<string>(
    item.terms.map((term: any) => `${term.taxonomy}:${term.id}`).filter(Boolean)
  );
}

function getOverlap(first: Set<string>, second: Set<string>) {
  return Array.from(first).filter((value) => {
    return Array.from(second).some((other) => {
      return (
        value === other ||
        (value.length > 5 && other.length > 5 && value.includes(other)) ||
        (value.length > 5 && other.length > 5 && other.includes(value))
      );
    });
  });
}

function getSpecificKeywords(keywords: Iterable<string>) {
  return Array.from(keywords).filter((keyword) => !weakTerms.has(keyword));
}

function getSpecificOverlap(first: Set<string>, second: Set<string>) {
  return getSpecificKeywords(getOverlap(first, second));
}

function getExactOverlap(first: Set<string>, second: Set<string>) {
  return Array.from(first).filter((value) => second.has(value));
}

function getLinkedFrom(item: any, items: any[]) {
  const targets = [item.url, item.slug].filter(Boolean);

  return items
    .filter((source) => {
    if (source.path === item.path) {
      return false;
    }

    return source.internalLinks.some((link: string) => {
      return targets.some((target) => link.includes(target));
    });
    })
    .map((source) => source.path);
}

function getBrokenInternalLinks(
  item: any,
  indexedUrls: Set<string>,
  indexedSlugs: Set<string>
) {
  return item.internalLinks.filter((link: string) => {
    if (isIgnorableInternalUrl(link)) {
      return false;
    }

    const url = comparableUrl(link, WP_URL!);

    if (url && indexedUrls.has(url)) {
      return false;
    }

    const pathParts = new URL(link).pathname.split("/").filter(Boolean);

    return !pathParts.some((part) => indexedSlugs.has(part));
  });
}

function alreadyLinksTo(item: any, target: any) {
  if (!target.url) {
    return false;
  }

  const targetUrl = comparableUrl(target.url, WP_URL!);

  return item.internalLinks.some((link: string) => {
    const linkUrl = comparableUrl(link, WP_URL!);

    return (
      (targetUrl && linkUrl === targetUrl) ||
      new URL(link).pathname.split("/").filter(Boolean).includes(target.slug)
    );
  });
}

function isExcludedFromOpportunities(item: any) {
  const value = normalizeKeyword(`${item.slug ?? ""} ${item.path ?? ""}`);

  return Array.from(excludeFromOpportunities).some((term) => {
    return value.includes(term);
  });
}

function getAnchorSuggestions(
  target: any,
  specificKeywords: string[],
  matchingHeadings: string[]
) {
  const title = cleanText(target.title);
  const semanticAnchor = target.semanticCluster.replace(/-/g, " ");
  const keywordAnchor = getAnchorKeywordPhrase(specificKeywords);
  const suggestions = [
    title.length <= 60 ? title : "",
    semanticAnchor,
    keywordAnchor,
    ...matchingHeadings.map(cleanText),
  ];
  const seen = new Set<string>();

  return suggestions
    .map((anchor) => anchor.trim().toLowerCase())
    .filter((anchor) => {
      const normalized = normalizeKeyword(anchor);

      if (
        !anchor ||
        anchor.length > 60 ||
        isWeakAnchor(anchor) ||
        GENERIC_ANCHORS.has(normalized) ||
        seen.has(normalized)
      ) {
        return false;
      }

      seen.add(normalized);
      return true;
    })
    .slice(0, 3);
}

function getAnchorKeywordPhrase(keywords: string[]) {
  const cleanKeywords = getSpecificKeywords(keywords)
    .filter((keyword) => keyword.length > 3)
    .filter((keyword, index, all) => {
      return !all.some((other, otherIndex) => {
        return (
          otherIndex < index &&
          (other.includes(keyword) || keyword.includes(other))
        );
      });
    });

  return cleanKeywords.slice(0, 3).join(" ");
}

function isWeakAnchor(anchor: string) {
  const keywords = Array.from(getKeywords(anchor));

  if (keywords.length === 0) {
    return true;
  }

  if (keywords.length === 1) {
    return weakTerms.has(keywords[0]) || anchor.length < 4;
  }

  return getSpecificKeywords(keywords).length === 0;
}

function getRelevanceScore(
  slugOverlap: string[],
  titleOverlap: string[],
  headingOverlap: string[],
  taxonomyOverlap: string[],
  sameCluster: boolean,
  specificKeywordCount: number
) {
  const score = Math.min(
    100,
    slugOverlap.length * 25 +
      titleOverlap.length * 20 +
      headingOverlap.length * 15 +
      taxonomyOverlap.length * 15 +
      (sameCluster ? 20 : 0)
  );

  if (score > 80 && specificKeywordCount < 2 && slugOverlap.length === 0 && titleOverlap.length === 0) {
    return 80;
  }

  if (specificKeywordCount < 2 && slugOverlap.length === 0 && titleOverlap.length === 0) {
    return Math.min(score, 60);
  }

  return score;
}

function getLinkOpportunities(item: any, items: any[]) {
  if (isExcludedFromOpportunities(item)) {
    return [];
  }

  const itemSlugKeywords = getKeywords(item.slug);
  const itemTitleKeywords = getKeywords(item.title);
  const itemContentKeywords = new Set<string>(item.contentKeywords);
  const itemTermKeys = getTermKeys(item);

  return items
    .flatMap((target) => {
      if (
        target.path === item.path ||
        !target.url ||
        isExcludedFromOpportunities(target) ||
        alreadyLinksTo(item, target)
      ) {
        return [];
      }

      const slugOverlap = getSpecificOverlap(itemSlugKeywords, getKeywords(target.slug));
      const titleOverlap = getSpecificOverlap(itemTitleKeywords, getKeywords(target.title));
      const contentOverlap = getOverlap(
        itemContentKeywords,
        new Set<string>(target.contentKeywords)
      );
      const taxonomyOverlap = getExactOverlap(itemTermKeys, getTermKeys(target));
      const keywordOverlap = new Set([
        ...slugOverlap,
        ...titleOverlap,
        ...contentOverlap,
      ]);
      const specificSlugOverlap = getSpecificKeywords(slugOverlap);
      const specificTitleOverlap = getSpecificKeywords(titleOverlap);
      const specificContentOverlap = getSpecificKeywords(contentOverlap);
      const specificKeywordOverlap = new Set([
        ...specificSlugOverlap,
        ...specificTitleOverlap,
        ...specificContentOverlap,
      ]);
      const matchingHeadings = getHeadingKeywordOverlap(
        target,
        Array.from(specificKeywordOverlap)
      );
      const sameCluster =
        item.semanticCluster &&
        target.semanticCluster &&
        item.semanticCluster === target.semanticCluster;
      const relevanceScore = getRelevanceScore(
        specificSlugOverlap,
        specificTitleOverlap,
        matchingHeadings,
        taxonomyOverlap,
        Boolean(sameCluster),
        specificKeywordOverlap.size
      );

      if (
        relevanceScore < 35 ||
        specificKeywordOverlap.size === 0 ||
        (specificKeywordOverlap.size < 2 && taxonomyOverlap.length === 0)
      ) {
        return [];
      }

      const reasons = [];

      if (specificSlugOverlap.length > 0) {
        reasons.push("shared slug keywords");
      }
      if (specificTitleOverlap.length > 0) {
        reasons.push("shared title keywords");
      }
      if (taxonomyOverlap.length > 0) {
        reasons.push("shared taxonomy terms");
      }
      if (reasons.length === 0 && specificContentOverlap.length > 1) {
        reasons.push("shared content keywords");
      }

      return [
        {
          target: target.url,
          reason: reasons.join(", "),
          relevanceScore,
          suggestedAnchors: getAnchorSuggestions(
            target,
            Array.from(specificKeywordOverlap),
            matchingHeadings
          ),
        },
      ];
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 5)
    .map(({ target, reason, relevanceScore, suggestedAnchors }) => {
      return { target, reason, relevanceScore, suggestedAnchors };
    });
}

function slugifyKeywords(keywords: string[]) {
  return keywords.slice(0, 2).join("-") || "uncategorized";
}

function getClusterKeywords(keywords: string[]) {
  const specific = getSpecificKeywords(keywords);
  const weak = keywords.filter((keyword) => weakTerms.has(keyword));

  if (specific.length >= 2) {
    return specific;
  }
  if (specific.length === 1) {
    return [...specific, ...weak];
  }

  return [];
}

function getSemanticCluster(item: any, items: any[]) {
  const itemKeywords = new Set<string>(item.contentKeywords);
  const preferredKeywords = Array.from(
    new Set([...getKeywords(item.slug), ...getKeywords(item.title)])
  ).filter((keyword) => itemKeywords.has(keyword));
  const sharedCounts = new Map<string, number>();

  for (const target of items) {
    if (target.path === item.path) {
      continue;
    }

    for (const keyword of getOverlap(
      itemKeywords,
      new Set<string>(target.contentKeywords)
    )) {
      sharedCounts.set(keyword, (sharedCounts.get(keyword) ?? 0) + 1);
    }
  }

  const sharedKeywords = preferredKeywords
    .filter((keyword: string) => sharedCounts.has(keyword))
    .sort((a: string, b: string) => {
      return (sharedCounts.get(b) ?? 0) - (sharedCounts.get(a) ?? 0);
    });
  const fallbackKeywords =
    preferredKeywords.length > 0 ? preferredKeywords : item.contentKeywords;

  return slugifyKeywords(
    getClusterKeywords(sharedKeywords.length > 0 ? sharedKeywords : fallbackKeywords)
  );
}

function getKeywordOverlapCount(item: any, items: any[]) {
  const itemKeywords = new Set<string>(getSpecificKeywords(item.contentKeywords));

  return items.reduce((total, target) => {
    if (target.path === item.path) {
      return total;
    }

    return (
      total +
      getOverlap(
        itemKeywords,
        new Set<string>(getSpecificKeywords(target.contentKeywords))
      ).length
    );
  }, 0);
}

function getHubScore(item: any, items: any[]) {
  return (
    item.linkedFrom.length * 3 +
    item.internalLinks.length +
    getKeywordOverlapCount(item, items)
  );
}

async function main() {
  if (!WP_URL) {
    throw new Error("Missing WP_URL in .env");
  }

  await loadSemanticConfig();

  const files = await findMarkdownFiles("content");
  const taxonomyData = await readJson("data/taxonomy-terms.json", {
    taxonomies: [],
  });
  const termsByKey = new Map<string, any>();
  const termItems = new Map<string, any>();
  const items: any[] = [];

  for (const taxonomy of taxonomyData.taxonomies) {
    const taxonomySlug = taxonomy.slug ?? taxonomy.taxonomy;

    for (const term of taxonomy.terms) {
      termsByKey.set(`${taxonomySlug}:${term.id}`, {
        taxonomy: taxonomySlug,
        id: term.id,
        slug: term.slug,
        name: term.name,
        link: term.link,
      });
    }
  }

  for (const path of files) {
    const file = await readFile(path, "utf8");
    const parsed = matter(file);
    const terms = [];

    for (const [taxonomy, ids] of Object.entries(getRawTerms(parsed.data))) {
      if (!Array.isArray(ids)) {
        continue;
      }

      for (const id of ids) {
        const term =
          termsByKey.get(`${taxonomy}:${id}`) ?? {
            taxonomy,
            id,
          };

        terms.push(term);

        const relationshipKey = `${taxonomy}:${id}`;
        const relationship = termItems.get(relationshipKey) ?? {
          taxonomy,
          id,
          slug: term.slug,
          name: term.name,
          items: [],
        };

        relationship.items.push(path);
        termItems.set(relationshipKey, relationship);
      }
    }

    const item = {
      title: parsed.data.title,
      slug: parsed.data.slug,
      type: parsed.data.type,
      restBase: parsed.data.restBase,
      status: parsed.data.status,
      path,
      url: normalizeInternalUrl(parsed.data.link, WP_URL),
      terms,
      headings: extractHeadings(parsed.content).map(cleanText),
      internalLinks: extractInternalLinks(parsed.content, WP_URL),
    };

    items.push({
      ...item,
      contentKeywords: getContentKeywords(item, parsed.content),
    });
  }

  const indexedUrls = new Set(
    items.flatMap((item) => {
      const url = item.url ? comparableUrl(item.url, WP_URL) : null;

      return url ? [url] : [];
    })
  );
  const indexedSlugs = new Set(items.map((item) => item.slug).filter(Boolean));

  for (const item of items) {
    item.semanticCluster = getSemanticCluster(item, items);
  }

  for (const item of items) {
    item.linkedFrom = getLinkedFrom(item, items);
    item.brokenInternalLinks = getBrokenInternalLinks(
      item,
      indexedUrls,
      indexedSlugs
    );
    item.linkOpportunities = getLinkOpportunities(item, items);
    item.hubScore = getHubScore(item, items);
    item.orphan = item.linkedFrom.length === 0;
    delete item.url;
    delete item.headings;
  }

  await mkdir("data", { recursive: true });
  await writeFile(
    "data/content-index.json",
    JSON.stringify(
      {
        items,
        termIndex: Array.from(termItems.values()),
      },
      null,
      2
    )
  );

  console.log(`Indexed ${items.length} items`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
