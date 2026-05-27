import {
  anchorWords,
  distinctiveTargetKeywords,
  hasTooManyStopwords,
  intersectionSize,
  isOverviewLikeSource,
  keywordList,
  sentenceTexts,
  topicKeywords,
} from "./anchors";
import { cleanText, truncateContext } from "./text";
import type { AnchorSuggestion, InsertionSuggestion, KeywordStats, PageSignals } from "./types";

export function scoreInsertionContext(
  sentence: string,
  source: PageSignals,
  target?: PageSignals,
  anchor?: AnchorSuggestion,
  stats?: KeywordStats
) {
  const sentenceKeywords = new Set(keywordList(sentence));
  const targetOverlap = intersectionSize(sentenceKeywords, topicKeywords(target));
  const distinctiveOverlap = stats
    ? intersectionSize(sentenceKeywords, distinctiveTargetKeywords(target, stats))
    : targetOverlap;
  const sourceOverlap = intersectionSize(sentenceKeywords, topicKeywords(source));
  const anchorOverlap = intersectionSize(sentenceKeywords, anchorWords(anchor?.text ?? ""));
  const words = cleanText(sentence).split(/\s+/).filter(Boolean);

  if (targetOverlap === 0 || distinctiveOverlap === 0 || words.length < 8 || words.length > 45) {
    return 0;
  }

  if (isOverviewLikeSource(source) && distinctiveOverlap < 2) {
    return 0;
  }

  /*
   * Context scoring prefers readable sentences that already discuss the target
   * topic, then gives a small boost when the chosen anchor or source topic is
   * already nearby. This is deterministic triage, not semantic search.
   */
  return (
    distinctiveOverlap * 45 +
    targetOverlap * 35 +
    anchorOverlap * 20 +
    Math.min(sourceOverlap, 3) * 5 +
    (words.length >= 12 && words.length <= 30 ? 15 : 0) -
    (hasTooManyStopwords(words) ? 15 : 0) -
    (isOverviewLikeSource(source) ? 35 : 0)
  );
}

export function getInsertionSuggestion(
  source: PageSignals,
  target?: PageSignals,
  anchor?: AnchorSuggestion,
  stats?: KeywordStats
): InsertionSuggestion | undefined {
  return sentenceTexts(source.body)
    .map((sentence) => {
      return {
        context: truncateContext(sentence),
        score: scoreInsertionContext(sentence, source, target, anchor, stats),
      };
    })
    .filter((suggestion) => suggestion.score > 0)
    .sort((a, b) => b.score - a.score || a.context.length - b.context.length)[0];
}
