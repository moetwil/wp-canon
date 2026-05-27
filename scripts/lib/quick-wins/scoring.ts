import {
  anchorWords,
  distinctiveTargetKeywords,
  getAnchorActionLabel,
  getAnchorSuggestion,
  getKeywordStats,
  intersectionSize,
  isBroadKeyword,
  keywordList,
  topicKeywords,
} from "./anchors";
import { getInsertionSuggestion } from "./context";
import { isUtilityPage, normalizeKeyword, samePage, sameTarget } from "./text";
import type {
  AnchorSuggestion,
  InsertionSuggestion,
  Issue,
  KeywordStats,
  PageSignals,
  PriorityItem,
  RankedOpportunity,
} from "./types";

const MAX_TOP_ITEMS = 10;
const MAX_LINK_OPPORTUNITIES = 10;
const MAX_ORPHAN_ITEMS = 10;
const MIN_LINK_RELEVANCE_SCORE = 60;
const MIN_TARGET_SPECIFICITY_SCORE = 25;
const MIN_ANCHOR_ALIGNMENT_SCORE = 35;
const LOW_INBOUND_LINK_COUNT = 1;

export function getTargetPage(target: string | undefined, pages: PageSignals[]) {
  return pages.find((page) => sameTarget(target, page));
}

export function getAnchorAlignmentScore(
  anchor: AnchorSuggestion | undefined,
  target: PageSignals | undefined,
  stats: KeywordStats
) {
  if (!anchor || !target) {
    return 0;
  }

  const anchorKeywordSet = anchorWords(anchor.text);
  const distinctiveOverlap = intersectionSize(
    anchorKeywordSet,
    distinctiveTargetKeywords(target, stats)
  );
  const broadOverlap = Array.from(anchorKeywordSet).filter((keyword) => {
    return isBroadKeyword(keyword, stats);
  }).length;

  return Math.max(0, distinctiveOverlap * 60 - broadOverlap * 15);
}

export function getTargetSpecificityScore(
  source: PageSignals,
  target: PageSignals | undefined,
  insertion: InsertionSuggestion | undefined,
  stats: KeywordStats
) {
  if (!target) {
    return 0;
  }

  const distinctive = distinctiveTargetKeywords(target, stats);
  const sourceOverlap = intersectionSize(topicKeywords(source), distinctive);
  const contextOverlap = insertion
    ? intersectionSize(new Set(keywordList(insertion.context)), distinctive)
    : 0;

  return sourceOverlap * 30 + contextOverlap * 50;
}

export function getTopLinkOpportunities(pages: PageSignals[]) {
  const seenSources = new Set<string>();
  const stats = getKeywordStats(pages);

  return pages
    .filter((page) => !isUtilityPage(page))
    .flatMap((source) => {
      return (source.item.linkOpportunities ?? []).map((opportunity) => {
        const targetPage = getTargetPage(opportunity.target, pages);
        const selfLink = samePage(source, targetPage);
        const anchor = getAnchorSuggestion(opportunity, source, targetPage, stats);
        const insertion = getInsertionSuggestion(source, targetPage, anchor, stats);

        return {
          ...opportunity,
          source,
          targetPage,
          selfLink,
          anchor,
          insertion,
          targetSpecificityScore: getTargetSpecificityScore(
            source,
            targetPage,
            insertion,
            stats
          ),
          anchorAlignmentScore: getAnchorAlignmentScore(anchor, targetPage, stats),
        };
      });
    })
    .filter((opportunity) => {
      return (
        (opportunity.relevanceScore ?? 0) >= MIN_LINK_RELEVANCE_SCORE &&
        !opportunity.selfLink &&
        opportunity.targetSpecificityScore >= MIN_TARGET_SPECIFICITY_SCORE &&
        opportunity.anchorAlignmentScore >= MIN_ANCHOR_ALIGNMENT_SCORE &&
        !isUtilityPage(opportunity.targetPage ?? opportunity.source) &&
        Boolean(opportunity.anchor) &&
        Boolean(opportunity.insertion)
      );
    })
    .sort((a, b) => {
      return (
        b.targetSpecificityScore - a.targetSpecificityScore ||
        b.anchorAlignmentScore - a.anchorAlignmentScore ||
        (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0) ||
        (a.source.item.path ?? "").localeCompare(b.source.item.path ?? "")
      );
    })
    .filter((opportunity) => {
      const source = opportunity.source.item.path ?? "";
      const target = opportunity.targetPage?.item.path ?? opportunity.target ?? "";
      const pair = `${source} -> ${target}`;

      if (seenSources.has(pair)) {
        return false;
      }

      seenSources.add(pair);
      return true;
    })
    .slice(0, MAX_LINK_OPPORTUNITIES);
}

export function getSuggestedSources(target: PageSignals, pages: PageSignals[]) {
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

export function getWeakLinkedPages(pages: PageSignals[]) {
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

export function topPriorities(
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
        action: `${getAnchorActionLabel(opportunity.anchor)} "${opportunity.anchor?.text}" in: "${opportunity.insertion?.context}"`,
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
