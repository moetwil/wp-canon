import { mkdir, readFile, writeFile } from "fs/promises";

type IndexItem = {
  title?: string;
  slug?: string;
  type?: string;
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

type ContentIndex = {
  items?: IndexItem[];
  termIndex?: Array<{
    taxonomy?: string;
    name?: string;
    slug?: string;
    items?: string[];
  }>;
};

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

function bulletList(items: string[]) {
  if (items.length === 0) {
    return "- None found.";
  }

  return items.map((item) => `- ${item}`).join("\n");
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
      Number(b.orphan === true) - Number(a.orphan === true) ||
      (b.brokenInternalLinks?.length ?? 0) - (a.brokenInternalLinks?.length ?? 0) ||
      (a.hubScore ?? 0) - (b.hubScore ?? 0)
    );
  });
}

function getClusterOverview(items: IndexItem[]) {
  return countBy(items, (item) => item.semanticCluster).map(([cluster, count]) => {
    return `${cluster}: ${count} item${count === 1 ? "" : "s"}`;
  });
}

function getTopActions(items: IndexItem[]) {
  const actions: string[] = [];
  const orphanCount = items.filter((item) => item.orphan).length;
  const brokenCount = items.reduce((total, item) => {
    return total + (item.brokenInternalLinks?.length ?? 0);
  }, 0);
  const opportunities = items
    .flatMap((item) => {
      return (item.linkOpportunities ?? []).map((opportunity) => {
        return { item, opportunity };
      });
    })
    .sort((a, b) => {
      return (b.opportunity.relevanceScore ?? 0) - (a.opportunity.relevanceScore ?? 0);
    });

  if (orphanCount > 0) {
    actions.push(`Add inbound links to ${orphanCount} orphaned item${orphanCount === 1 ? "" : "s"}.`);
  }
  if (brokenCount > 0) {
    actions.push(`Fix or remove ${brokenCount} broken internal link${brokenCount === 1 ? "" : "s"}.`);
  }

  for (const { item, opportunity } of opportunities.slice(0, 3)) {
    const anchors = opportunity.suggestedAnchors?.join(", ");
    actions.push(
      `Consider linking from ${item.path} to ${opportunity.target}` +
        (anchors ? ` using anchor: ${anchors}.` : ".")
    );
  }

  if (actions.length === 0) {
    actions.push("No urgent graph issues found in the current index.");
  }

  return actions;
}

function buildReport(index: ContentIndex) {
  const items = index.items ?? [];
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
  const strongest = topItems(getStrongestPages(items), 5);
  const weakest = topItems(getWeakestPages(items), 5);
  const brokenItems = items.filter((item) => (item.brokenInternalLinks?.length ?? 0) > 0);

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

## Strongest Pages

${bulletList(strongest.map(formatItemLine))}

## Weakest Pages

${bulletList(weakest.map(formatItemLine))}

## Orphan Or Weakly Linked Content

${bulletList(orphanItems.slice(0, 10).map(formatItemLine))}

## Broken Internal Links

${
  brokenItems.length === 0
    ? "- None found."
    : brokenItems
        .slice(0, 10)
        .map((item) => {
          return `- ${itemLabel(item)}\n  - ${(item.brokenInternalLinks ?? []).join("\n  - ")}`;
        })
        .join("\n")
}

## Cluster Overview

${bulletList(getClusterOverview(items).slice(0, 12))}

## Top Actionable Improvements

${bulletList(getTopActions(items))}
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
