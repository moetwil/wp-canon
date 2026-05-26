import { mkdir, readFile, writeFile } from "fs/promises";

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
  linkOpportunities?: Array<{
    target?: string;
    reason?: string;
    relevanceScore?: number;
    suggestedAnchors?: string[];
  }>;
  semanticCluster?: string;
  hubScore?: number;
  orphan?: boolean;
};

type LinkOpportunity = {
  item: IndexItem;
  target?: string;
  reason?: string;
  relevanceScore?: number;
  suggestedAnchors?: string[];
};

type ContentIndex = {
  items?: IndexItem[];
  termIndex?: Array<{
    taxonomy?: string;
    name?: string;
    slug?: string;
    items?: string[];
  }>;
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

function countBy<T>(items: T[], getKey: (item: T) => string | undefined) {
  const counts = new Map<string, number>();

  for (const item of items) {
    const key = getKey(item) ?? "unknown";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

function itemLabel(item: IndexItem) {
  return `${item.title ?? item.slug ?? item.path ?? "Untitled"} (${item.path ?? "no path"})`;
}

function topItems(items: IndexItem[], limit: number) {
  return items.slice(0, limit);
}

function plural(value: number, singular: string, pluralValue = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralValue}`;
}

function bulletList(items: string[]) {
  if (items.length === 0) {
    return "- None found.";
  }

  return items.map((item) => `- ${item}`).join("\n");
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

  return HIGH_VALUE_TYPE_PATTERNS.some((pattern) => {
    return includesPattern(value, pattern);
  });
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

function formatItemLine(item: IndexItem) {
  const inbound = item.linkedFrom?.length ?? 0;
  const outbound = item.internalLinks?.length ?? 0;
  const broken = item.brokenInternalLinks?.length ?? 0;
  const score = item.hubScore ?? 0;

  return `${itemLabel(item)} - hubScore ${score}, inbound ${inbound}, outbound ${outbound}, broken ${broken}`;
}

function getStrongestPages(items: IndexItem[]) {
  return [...items].sort((a, b) => {
    return (
      (b.hubScore ?? 0) - (a.hubScore ?? 0) ||
      (b.linkedFrom?.length ?? 0) - (a.linkedFrom?.length ?? 0) ||
      (b.internalLinks?.length ?? 0) - (a.internalLinks?.length ?? 0)
    );
  });
}

function getWeakestPages(items: IndexItem[]) {
  return [...items].sort((a, b) => {
    return (
      getContentPriority(b) - getContentPriority(a) ||
      Number(b.orphan === true) - Number(a.orphan === true) ||
      (b.brokenInternalLinks?.length ?? 0) -
        (a.brokenInternalLinks?.length ?? 0) ||
      (a.hubScore ?? 0) - (b.hubScore ?? 0)
    );
  });
}

function getClusterCounts(items: IndexItem[]) {
  return countBy(items, (item) => item.semanticCluster);
}

function getClusterOverview(items: IndexItem[]) {
  return getClusterCounts(items)
    .filter(([, count]) => count >= 2)
    .map(([cluster, count]) => {
      return `${cluster}: ${count} item${count === 1 ? "" : "s"}`;
    });
}

function getHighValueWeakItems(items: IndexItem[]) {
  return getWeakestPages(items).filter((item) => {
    return !isUtilityItem(item) && (item.orphan || (item.linkedFrom?.length ?? 0) <= 1);
  });
}

function getTopLinkOpportunities(items: IndexItem[], limit = 8) {
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
      return (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
    })
    .filter((opportunity) => {
      const source = opportunity.item.path ?? "unknown";
      const pair = `${source} -> ${opportunity.target ?? "unknown"}`;

      if (seenPairs.has(pair) || seenSources.has(source)) {
        return false;
      }

      seenPairs.add(pair);
      seenSources.add(source);
      return true;
    })
    .slice(0, limit);
}

function formatOpportunity(opportunity: LinkOpportunity) {
  const anchors = opportunity.suggestedAnchors?.join(", ");
  const score = opportunity.relevanceScore ?? 0;

  return `${opportunity.item.path ?? "unknown source"} -> ${
    opportunity.target ?? "unknown target"
  } (score ${score}${opportunity.reason ? `, ${opportunity.reason}` : ""})` +
    (anchors ? ` using anchor: ${anchors}` : "");
}

function getTopActions(
  brokenItems: IndexItem[],
  highValueWeakItems: IndexItem[],
  opportunities: LinkOpportunity[]
) {
  const actions: string[] = [];
  const brokenCount = brokenItems.reduce((total, item) => {
    return total + (item.brokenInternalLinks?.length ?? 0);
  }, 0);

  if (brokenCount > 0) {
    actions.push(`Fix or remove ${plural(brokenCount, "broken internal link")}.`);
  }

  const priorityOrphans = highValueWeakItems.filter((item) => item.orphan);
  if (priorityOrphans.length > 0) {
    actions.push(
      `Add inbound links to ${plural(
        Math.min(priorityOrphans.length, 5),
        "high-value orphan page"
      )}: ${priorityOrphans.slice(0, 5).map((item) => item.path).join(", ")}.`
    );
  }

  if (opportunities.length > 0) {
    actions.push(
      `Add the strongest contextual links first: ${opportunities
        .slice(0, 3)
        .map((opportunity) => {
          return `${opportunity.item.path} -> ${opportunity.target}`;
        })
        .join("; ")}.`
    );
  }

  if (actions.length === 0) {
    actions.push("No urgent graph issues found in the current index.");
  }

  return actions;
}

function getUtilitySummary(items: IndexItem[]) {
  return countBy(items, (item) => item.type).map(([type, count]) => {
    return `${type}: ${count}`;
  });
}

function getBrokenLinkLines(items: IndexItem[]) {
  return items.slice(0, 10).map((item) => {
    return `- ${itemLabel(item)}\n  - ${(item.brokenInternalLinks ?? []).join("\n  - ")}`;
  });
}

function buildReport(index: ContentIndex) {
  const items = index.items ?? [];
  const utilityItems = items.filter(isUtilityItem);
  const contentItems = items.filter((item) => !isUtilityItem(item));
  const totalInternalLinks = items.reduce((total, item) => {
    return total + (item.internalLinks?.length ?? 0);
  }, 0);
  const totalBrokenLinks = items.reduce((total, item) => {
    return total + (item.brokenInternalLinks?.length ?? 0);
  }, 0);
  const orphanItems = items.filter((item) => item.orphan);
  const opportunityCount = items.reduce((total, item) => {
    return total + (item.linkOpportunities?.length ?? 0);
  }, 0);
  const types = countBy(items, (item) => item.type);
  const statuses = countBy(items, (item) => item.status);
  const strongest = topItems(getStrongestPages(contentItems), 5);
  const highValueWeakItems = getHighValueWeakItems(contentItems);
  const brokenItems = items.filter((item) => {
    return (item.brokenInternalLinks?.length ?? 0) > 0;
  });
  const clusterCounts = getClusterCounts(contentItems);
  const singletonClusterCount = clusterCounts.filter(([, count]) => count === 1)
    .length;
  const topOpportunities = getTopLinkOpportunities(contentItems);
  const priorityOrphans = highValueWeakItems.filter((item) => item.orphan);
  const utilityOrphans = utilityItems.filter((item) => item.orphan);

  return `# Content Index Summary

Generated from \`data/content-index.json\`.

## Overall Health

- Indexed items: ${items.length}
- Content types: ${types.map(([type, count]) => `${type} (${count})`).join(", ") || "none"}
- Statuses: ${statuses.map(([status, count]) => `${status} (${count})`).join(", ") || "none"}
- Internal links: ${totalInternalLinks}
- Broken internal links: ${totalBrokenLinks}
- Orphaned items: ${orphanItems.length}
- Link opportunities: ${opportunityCount}
- Semantic clusters: ${countBy(items, (item) => item.semanticCluster).length}

## Content Split

- SEO/content pages: ${contentItems.length}
- Utility/legal/system pages: ${utilityItems.length}
- Priority orphan content: ${priorityOrphans.length}
- Utility/system orphans deprioritized: ${utilityOrphans.length}

## Strongest Pages

${bulletList(strongest.map(formatItemLine))}

## Priority Orphan Or Weakly Linked Content

${bulletList(topItems(highValueWeakItems, 10).map(formatItemLine))}

## Utility Legal Or System Pages

These are excluded from top orphan recommendations unless they have broken links.

${bulletList(getUtilitySummary(utilityItems))}

## Broken Internal Links

${
  brokenItems.length === 0
    ? "- None found."
    : getBrokenLinkLines(brokenItems).join("\n")
}

## Cluster Overview

${bulletList(getClusterOverview(contentItems).slice(0, 12))}

Singleton clusters hidden from this overview: ${singletonClusterCount}

## Best Link Opportunities

Only opportunities with relevance score ${MIN_RELEVANCE_SCORE}+ are shown, with at most one recommendation per source page.

${bulletList(topOpportunities.map(formatOpportunity))}

## Top Actionable Improvements

${bulletList(getTopActions(brokenItems, highValueWeakItems, topOpportunities))}
`;
}

async function main() {
  const index = JSON.parse(await readFile("data/content-index.json", "utf8"));
  const report = buildReport(index);

  await mkdir("reports", { recursive: true });
  await writeFile("reports/content-index-summary.md", report);

  console.log("Saved reports/content-index-summary.md");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
