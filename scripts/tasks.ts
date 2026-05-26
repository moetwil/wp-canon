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
  return item.title ?? item.slug ?? item.path ?? "Untitled";
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
        return { item, ...opportunity };
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

      if (seenSources.has(source) || seenPairs.has(pair)) {
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
        return `## ${index + 1}. Link from ${itemTitle(
          opportunity.item
        )} to related content

- Affected file/page: ${opportunity.item.path ?? "unknown"}
- Issue summary: The source page appears contextually related to the target but does not currently link to it.
- Suggested action: Add one natural internal link from the affected page to the target URL.
- Related URLs:
${listItems([opportunity.target ?? "unknown target"])}
- Suggested anchor text if available:
${listItems(opportunity.suggestedAnchors ?? [])}
- Relevant reasoning/relevance score if available: score ${
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
