import { getAnchorActionLabel } from "./anchors";
import { getMetadataIssues, getStructureIssues } from "./issues";
import { getSuggestedSources, getTopLinkOpportunities, getWeakLinkedPages, topPriorities } from "./scoring";
import { isUtilityPage } from "./text";
import type { Issue, PageSignals, PriorityItem, RankedOpportunity } from "./types";

export function bulletList(items: string[]) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None found.";
}

export function renderLinkOpportunities(opportunities: RankedOpportunity[]) {
  if (opportunities.length === 0) {
    return "- None found.";
  }

  return opportunities
    .map((opportunity) => {
      const targetUrl = opportunity.targetPage?.url ?? opportunity.target ?? "unknown";

      return `- Source: ${opportunity.source.item.path}
  - Target: ${opportunity.targetPage?.item.path ?? targetUrl}
  - Suggested insertion context: "${opportunity.insertion?.context ?? "No context found"}"
  - Suggested link: [${opportunity.anchor?.text ?? "anchor"}](${targetUrl})
  - ${getAnchorActionLabel(opportunity.anchor)}: "${opportunity.anchor?.text}"
  - Anchor confidence: ${opportunity.anchor?.confidence ?? "unknown"}
  - Target specificity score: ${opportunity.targetSpecificityScore}
  - Anchor alignment score: ${opportunity.anchorAlignmentScore}
  - Score: ${opportunity.relevanceScore ?? "unknown"}${opportunity.reason ? ` | Reason: ${opportunity.reason}` : ""}`;
    })
    .join("\n");
}

export function renderIssues(issues: Issue[]) {
  return bulletList(
    issues.map((issue) => {
      return `${issue.page.title} (${issue.page.item.path}) | ${issue.issue} | ${issue.action}`;
    })
  );
}

export function renderWeakPages(pages: PageSignals[], allPages: PageSignals[]) {
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

export function renderPriorities(priorities: PriorityItem[]) {
  if (priorities.length === 0) {
    return "- None found.";
  }

  return priorities
    .map((item, index) => {
      return `${index + 1}. ${item.title}\n   - ${item.action}\n   - Ease: ${item.ease}`;
    })
    .join("\n");
}

export function renderReport(pages: PageSignals[]) {
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
