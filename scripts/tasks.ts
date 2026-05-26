import { mkdir, readFile, writeFile } from "fs/promises";

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
  path?: string;
  internalLinks?: string[];
  linkedFrom?: string[];
  brokenInternalLinks?: string[];
  linkOpportunities?: LinkOpportunity[];
  semanticCluster?: string;
  hubScore?: number;
  orphan?: boolean;
};

type ContentIndex = {
  items?: IndexItem[];
};

type RankedOpportunity = LinkOpportunity & {
  item: IndexItem;
  targetItem?: IndexItem;
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
const HIGH_VALUE_TYPE_PATTERNS = [
  "article",
  "behandeling",
  "case",
  "dienst",
  "faq",
  "guide",
  "kennisbank",
  "knowledge",
  "landing",
  "page",
  "post",
  "product",
  "service",
  "treatment",
];
const MIN_RELEVANCE_SCORE = 60;

function itemTitle(item: IndexItem) {
  return cleanText(item.title ?? item.slug ?? item.path ?? "Untitled");
}

function cleanText(value: string) {
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
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[_|/\\]+/g, " ")
    .replace(/\s[-–—:;]\s/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKeyword(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getAnchorWords(value: string) {
  return cleanText(value)
    .split(/[^a-zA-Z0-9À-ÿ&'’]+/i)
    .map(normalizeKeyword)
    .filter((word) => word.length > 2 && !/^\d+$/.test(word));
}

function itemSearchValue(item: IndexItem) {
  return `${item.type ?? ""} ${item.restBase ?? ""} ${item.slug ?? ""} ${
    item.title ?? ""
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

function isUtilityItem(item: IndexItem) {
  const value = itemSearchValue(item);

  return UTILITY_PATTERNS.some((pattern) => includesPattern(value, pattern));
}

function isHighValueType(item: IndexItem) {
  const value = itemSearchValue(item);

  return HIGH_VALUE_TYPE_PATTERNS.some((pattern) => includesPattern(value, pattern));
}

function getContentPriority(item: IndexItem) {
  if (isUtilityItem(item)) {
    return -1000;
  }

  const inbound = item.linkedFrom?.length ?? 0;
  const outbound = item.internalLinks?.length ?? 0;
  const broken = item.brokenInternalLinks?.length ?? 0;

  return (
    (isHighValueType(item) ? 100 : 40) +
    (item.orphan ? 40 : 0) +
    (inbound === 1 ? 15 : 0) +
    broken * 10 +
    Math.min(outbound, 10) -
    Math.min(item.hubScore ?? 0, 30)
  );
}

function targetPathParts(target?: string) {
  if (!target) {
    return [];
  }

  try {
    return new URL(target).pathname.split("/").filter(Boolean);
  } catch {
    return target.split("/").filter(Boolean);
  }
}

function findTargetItem(target: string | undefined, items: IndexItem[]) {
  const parts = targetPathParts(target);

  if (parts.length === 0) {
    return undefined;
  }

  const lastPart = parts[parts.length - 1];

  return items.find((item) => {
    return item.slug === lastPart || Boolean(item.slug && parts.includes(item.slug));
  });
}

function isNaturalAnchor(anchor: string) {
  const cleanAnchor = cleanText(anchor);
  const words = getAnchorWords(cleanAnchor);

  if (!cleanAnchor || cleanAnchor.length > 60 || words.length === 0) {
    return false;
  }

  if (words.length >= 3) {
    return /[A-ZÀ-Ý]/.test(cleanAnchor) || /[&'’]/.test(cleanAnchor);
  }

  if (words.length === 2) {
    return cleanAnchor.length >= 8;
  }

  return cleanAnchor.length >= 4 && /^[A-ZÀ-Ý0-9]/.test(cleanAnchor);
}

function getSlugAnchor(slug?: string) {
  const anchor = cleanText(String(slug ?? "").replace(/[-_]+/g, " "));

  return isNaturalAnchor(anchor) ? anchor : "";
}

function getAnchorSuggestions(
  opportunity: RankedOpportunity,
  targetItem?: IndexItem
) {
  const candidates = [
    targetItem?.title,
    getSlugAnchor(targetItem?.slug),
    ...(opportunity.suggestedAnchors ?? []),
  ];
  const seen = new Set<string>();

  return candidates
    .map((anchor) => cleanText(anchor ?? ""))
    .filter((anchor) => {
      const key = normalizeKeyword(anchor);

      if (!isNaturalAnchor(anchor) || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

function sortedBrokenItems(items: IndexItem[]) {
  return items
    .filter((item) => (item.brokenInternalLinks?.length ?? 0) > 0)
    .sort((a, b) => {
      return (
        (b.brokenInternalLinks?.length ?? 0) -
          (a.brokenInternalLinks?.length ?? 0) ||
        (a.path ?? "").localeCompare(b.path ?? "")
      );
    });
}

function sortedOrphanItems(items: IndexItem[]) {
  return items
    .filter((item) => item.orphan && !isUtilityItem(item))
    .sort((a, b) => {
      return getContentPriority(b) - getContentPriority(a) || (a.path ?? "").localeCompare(b.path ?? "");
    })
    .slice(0, 20);
}

function sortedOpportunities(items: IndexItem[]) {
  const seenSources = new Set<string>();
  const seenPairs = new Set<string>();

  return items
    .filter((item) => !isUtilityItem(item))
    .flatMap((item) => {
      return (item.linkOpportunities ?? []).map((opportunity) => {
        return {
          item,
          targetItem: findTargetItem(opportunity.target, items),
          ...opportunity,
        };
      });
    })
    .filter((opportunity) => {
      return (
        !isUtilityItem({ path: opportunity.target, slug: opportunity.target }) &&
        (opportunity.relevanceScore ?? 0) >= MIN_RELEVANCE_SCORE
      );
    })
    .sort((a, b) => {
      return (
        (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0) ||
        (a.item.path ?? "").localeCompare(b.item.path ?? "") ||
        (a.target ?? "").localeCompare(b.target ?? "")
      );
    })
    .filter((opportunity) => {
      const source = opportunity.item.path ?? "unknown";
      const pair = `${source} -> ${opportunity.target ?? "unknown"}`;
      const anchors = getAnchorSuggestions(opportunity, opportunity.targetItem);

      if (anchors.length === 0 || seenSources.has(source) || seenPairs.has(pair)) {
        return false;
      }

      seenSources.add(source);
      seenPairs.add(pair);
      return true;
    })
    .slice(0, 10);
}

function listItems(values: string[]) {
  if (values.length === 0) {
    return "  - None";
  }

  return values.map((value) => `  - ${value}`).join("\n");
}

function taskHeader(title: string, summary: string) {
  return `# ${title}

${summary}

`;
}

function renderBrokenLinks(items: IndexItem[]) {
  const tasks = sortedBrokenItems(items);

  if (tasks.length === 0) {
    return taskHeader(
      "Fix Broken Internal Links",
      "No broken internal links were found in the current content index."
    );
  }

  return (
    taskHeader(
      "Fix Broken Internal Links",
      `Review ${tasks.length} page${tasks.length === 1 ? "" : "s"} with broken internal links.`
    ) +
    tasks
      .map((item, index) => {
        return `## ${index + 1}. Fix broken links on ${itemTitle(item)}

- Affected file/page: ${item.path ?? "unknown"}
- Issue summary: This page links to ${
          item.brokenInternalLinks?.length ?? 0
        } internal URL${(item.brokenInternalLinks?.length ?? 0) === 1 ? "" : "s"} that are not present in the local index.
- Suggested action: Update each URL to the correct indexed page, remove stale links, or add the missing page to the WordPress pull if it should exist.
- Related URLs:
${listItems(item.brokenInternalLinks ?? [])}
- Reasoning: Broken internal links are highest priority because they create direct crawl and user-experience issues.
`;
      })
      .join("\n")
  );
}

function renderOrphans(items: IndexItem[]) {
  const tasks = sortedOrphanItems(items);

  if (tasks.length === 0) {
    return taskHeader(
      "Improve High-Priority Orphan Content",
      "No high-priority orphan content was found in the current content index."
    );
  }

  return (
    taskHeader(
      "Improve High-Priority Orphan Content",
      `Review ${tasks.length} orphan page${tasks.length === 1 ? "" : "s"} that look like SEO or content pages. Utility/legal/system pages are excluded.`
    ) +
    tasks
      .map((item, index) => {
        return `## ${index + 1}. Add inbound links to ${itemTitle(item)}

- Affected file/page: ${item.path ?? "unknown"}
- Issue summary: This page has no inbound internal links in the current index.
- Suggested action: Add contextual links from relevant hub, service, category, or related article pages.
- Related URLs:
  - None available in index; choose source pages from the same topic or semantic cluster.
- Suggested anchor text if available:
  - ${item.title ?? item.slug ?? "Use the page title or primary topic"}
- Relevant reasoning/relevance score if available: priority ${getContentPriority(
          item
        )}, semantic cluster ${item.semanticCluster ?? "unknown"}, hubScore ${
          item.hubScore ?? 0
        }.
`;
      })
      .join("\n")
  );
}

function renderOpportunities(items: IndexItem[]) {
  const tasks = sortedOpportunities(items);

  if (tasks.length === 0) {
    return taskHeader(
      "Add Contextual Internal Links",
      `No contextual link opportunities met the relevance score threshold of ${MIN_RELEVANCE_SCORE}.`
    );
  }

  return (
    taskHeader(
      "Add Contextual Internal Links",
      `Review the top ${tasks.length} contextual link opportunit${
        tasks.length === 1 ? "y" : "ies"
      }. Each source page appears only once.`
    ) +
    tasks
      .map((opportunity, index) => {
        const targetTitle = opportunity.targetItem
          ? itemTitle(opportunity.targetItem)
          : "Unknown target";
        const anchors = getAnchorSuggestions(opportunity, opportunity.targetItem);
        const [preferredAnchor, ...alternativeAnchors] = anchors;

        return `## ${index + 1}. Link from ${itemTitle(
          opportunity.item
        )} to related content

- Affected file/page: ${opportunity.item.path ?? "unknown"}
- Target title: ${targetTitle}
- Target URL: ${opportunity.target ?? "unknown target"}
- Issue summary: The source page appears contextually related to the target but does not currently link to it.
- Suggested action: Add one natural internal link from the affected page to the target URL.
- Preferred anchor: ${preferredAnchor ?? "Use the target page title"}
- Alternative anchors:
${listItems(alternativeAnchors)}
- Relevance score and reason: score ${
          opportunity.relevanceScore ?? "unknown"
        }${opportunity.reason ? `, ${opportunity.reason}` : ""}.
`;
      })
      .join("\n")
  );
}

async function main() {
  const index = JSON.parse(
    await readFile("data/content-index.json", "utf8")
  ) as ContentIndex;
  const items = index.items ?? [];

  await mkdir("tasks", { recursive: true });
  await writeFile("tasks/fix-broken-links.md", renderBrokenLinks(items));
  await writeFile("tasks/improve-orphan-content.md", renderOrphans(items));
  await writeFile("tasks/add-contextual-links.md", renderOpportunities(items));

  console.log("Saved tasks/fix-broken-links.md");
  console.log("Saved tasks/improve-orphan-content.md");
  console.log("Saved tasks/add-contextual-links.md");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
