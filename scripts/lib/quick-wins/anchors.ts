import {
  ANCHOR_START_WORDS,
  ANCHOR_STOPWORDS,
  CTA_WORDS,
  EDITORIAL_WORDS,
  FALLBACK_ANCHOR_FILLER_WORDS,
  GENERIC_ANCHORS,
  WEAK_ANCHOR_END_WORDS,
} from "./language-packs";
import { cleanText, normalizeKeyword } from "./text";
import type {
  AnchorSuggestion,
  KeywordStats,
  LinkOpportunity,
  PageSignals,
} from "./types";

const EXISTING_ANCHOR_SCORE_MARGIN = 35;
const ENABLE_EXISTING_PHRASE_ANCHORS = false;

export function naturalAnchor(anchor: string) {
  const cleanAnchor = cleanText(anchor);
  const words = cleanAnchor.split(/\s+/).filter(Boolean);
  const normalized = normalizeKeyword(cleanAnchor);
  const keywords = keywordList(cleanAnchor);

  if (
    !cleanAnchor ||
    cleanAnchor.length > 70 ||
    words.length < 2 ||
    words.length > 7 ||
    GENERIC_ANCHORS.has(normalized)
  ) {
    return "";
  }

  if (Array.from(GENERIC_ANCHORS).some((anchor) => normalized.includes(anchor))) {
    return "";
  }

  if (keywords.length === 0 || hasTooManyStopwords(words) || isMostlyEditorialWords(keywords)) {
    return "";
  }

  if (
    hasWeirdCapitalBoundary(words) ||
    startsWithWeakAnchorWord(words)
  ) {
    return "";
  }

  return cleanAnchor;
}

export function startsWithWeakAnchorWord(words: string[]) {
  return ANCHOR_START_WORDS.has(normalizeKeyword(words[0] ?? ""));
}

export function endsWithWeakAnchorWord(words: string[]) {
  return WEAK_ANCHOR_END_WORDS.has(normalizeKeyword(words[words.length - 1] ?? ""));
}

export function cleanFallbackAnchorValue(value?: string) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[-_]+/g, " ");
}

export function fallbackAnchorWords(value?: string) {
  return cleanFallbackAnchorValue(value)
    .split(/[^a-zA-Z0-9À-ÿ]+/i)
    .map(normalizeKeyword)
    .filter((word) => {
      return (
        word.length > 1 &&
        !/^\d+$/.test(word) &&
        !FALLBACK_ANCHOR_FILLER_WORDS.has(word)
      );
    });
}

export function phraseFromWords(words: string[]) {
  return naturalAnchor(words.join(" "));
}

export function trimBroadSuffix(words: string[], target: PageSignals, stats: KeywordStats) {
  let end = words.length;

  while (
    end > 2 &&
    isBroadKeyword(words[end - 1] ?? "", stats) &&
    !isDistinctiveConnectorPhrase(words.slice(0, end), target, stats)
  ) {
    end -= 1;
  }

  const firstBroadIndex = words.findIndex((word) => isBroadKeyword(word, stats));

  if (firstBroadIndex >= 2) {
    return words.slice(0, firstBroadIndex);
  }

  return words.slice(0, end);
}

export function isDistinctiveConnectorPhrase(
  words: string[],
  target: PageSignals,
  stats: KeywordStats
) {
  const distinctive = distinctiveTargetKeywords(target, stats);

  return words.some((word, index) => {
    return (
      ANCHOR_STOPWORDS.has(word) &&
      words.slice(index + 1).some((laterWord) => distinctive.has(laterWord))
    );
  });
}

export function bestOrderedFallbackPhrase(words: string[]) {
  for (let size = Math.min(5, words.length); size >= 2; size -= 1) {
    const phrase = phraseFromWords(words.slice(0, size));

    if (phrase) {
      return phrase;
    }
  }

  return "";
}

export function fallbackAnchorFromValue(
  value: string | undefined,
  target: PageSignals,
  stats: KeywordStats
) {
  const words = fallbackAnchorWords(value);

  if (words.length < 2) {
    return "";
  }

  const suffixTrimmedWords = trimBroadSuffix(words, target, stats);
  const suffixTrimmedPhrase = bestOrderedFallbackPhrase(suffixTrimmedWords);

  if (suffixTrimmedPhrase) {
    return suffixTrimmedPhrase;
  }

  return bestOrderedFallbackPhrase(words);
}

export function slugAnchor(target: PageSignals, stats: KeywordStats) {
  return fallbackAnchorFromValue(target.item.slug, target, stats);
}

export function keywordList(value: string) {
  return cleanText(value)
    .split(/[^a-zA-Z0-9À-ÿ]+/i)
    .map(normalizeKeyword)
    .filter((word) => {
      return word.length > 2 && !/^\d+$/.test(word) && !ANCHOR_STOPWORDS.has(word);
    });
}

export function topicKeywords(page?: PageSignals) {
  if (!page) {
    return new Set<string>();
  }

  return new Set([
    ...keywordList(page.title),
    ...keywordList(page.item.slug ?? ""),
    ...(page.item.contentKeywords ?? []).map(normalizeKeyword),
  ]);
}

export function weightedTargetKeywords(page?: PageSignals) {
  if (!page) {
    return [];
  }

  const scores = new Map<string, number>();

  for (const keyword of keywordList(page.title)) {
    scores.set(keyword, (scores.get(keyword) ?? 0) + 4);
  }
  for (const keyword of keywordList(page.item.slug ?? "")) {
    scores.set(keyword, (scores.get(keyword) ?? 0) + 4);
  }
  for (const keyword of page.item.contentKeywords ?? []) {
    const normalized = normalizeKeyword(keyword);

    if (normalized && !ANCHOR_STOPWORDS.has(normalized)) {
      scores.set(normalized, (scores.get(normalized) ?? 0) + 1);
    }
  }

  return Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
}

export function getKeywordStats(pages: PageSignals[]): KeywordStats {
  const documentFrequency = new Map<string, number>();

  for (const page of pages) {
    for (const keyword of topicKeywords(page)) {
      documentFrequency.set(keyword, (documentFrequency.get(keyword) ?? 0) + 1);
    }
  }

  return { pageCount: pages.length, documentFrequency };
}

export function isBroadKeyword(keyword: string, stats: KeywordStats) {
  const frequency = stats.documentFrequency.get(keyword) ?? 0;
  const broadThreshold = Math.max(3, Math.ceil(stats.pageCount * 0.25));

  return frequency >= broadThreshold;
}

export function distinctiveTargetKeywords(page: PageSignals | undefined, stats: KeywordStats) {
  const weighted = weightedTargetKeywords(page);
  const distinctive = weighted
    .filter(([keyword]) => {
      return !isBroadKeyword(keyword, stats) && !EDITORIAL_WORDS.has(keyword);
    })
    .map(([keyword]) => keyword)
    .slice(0, 8);

  if (distinctive.length > 0) {
    return new Set(distinctive);
  }

  return new Set(
    weighted
      .filter(([keyword]) => !EDITORIAL_WORDS.has(keyword))
      .map(([keyword]) => keyword)
      .slice(0, 5)
  );
}

export function paragraphBlocks(content: string) {
  return content
    .replace(/```[\s\S]*?```/g, "\n")
    .replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, "\n")
    .replace(/^#{1,6}\s+.*$/gm, "\n")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "\n")
    .replace(/<ul[\s\S]*?<\/ul>/gi, "\n")
    .replace(/<ol[\s\S]*?<\/ol>/gi, "\n")
    .split(/\n{2,}|<\/p>|<br\s*\/?>/gi)
    .filter((block) => !isIgnoredAnchorBlock(block))
    .map(cleanText)
    .filter((block) => block.length > 0);
}

export function isIgnoredAnchorBlock(block: string) {
  const text = cleanText(block);
  const normalized = normalizeKeyword(text);

  if (!text) {
    return true;
  }

  if (/^\s*[-*+]\s+/m.test(block) || /^\s*\d+\.\s+/m.test(block)) {
    return true;
  }

  return Array.from(GENERIC_ANCHORS).some((anchor) => normalized.includes(anchor));
}

export function sentenceTexts(content: string) {
  return paragraphBlocks(content).flatMap((block) => {
    return block
      .split(/(?<=[.!?])\s+/g)
      .map(cleanText)
      .filter((sentence) => {
        return (
          sentence.length >= 25 &&
          /[.!?]$/.test(sentence) &&
          !isIgnoredContextSentence(sentence)
        );
      });
  });
}

export function isIgnoredContextSentence(sentence: string) {
  const normalized = normalizeKeyword(sentence);
  const keywords = keywordList(sentence);

  if (Array.from(GENERIC_ANCHORS).some((anchor) => normalized.includes(anchor))) {
    return true;
  }

  if (keywords.some((word) => CTA_WORDS.has(word)) && keywords.length <= 8) {
    return true;
  }

  return (
    isMostlyEditorialWords(keywords) ||
    looksLikeTitleExcerptSentence(sentence) ||
    repeatsOpeningPhrase(sentence)
  );
}

export function looksLikeTitleExcerptSentence(sentence: string) {
  const [title, excerpt] = sentence.split(/:\s+/, 2);

  return Boolean(
    title &&
      excerpt &&
      title.split(/\s+/).length <= 9 &&
      excerpt.toLowerCase().startsWith(title.toLowerCase().split(/\s+/)[0])
  );
}

export function repeatsOpeningPhrase(sentence: string) {
  const words = cleanText(sentence).split(/\s+/);

  if (words.length < 10) {
    return false;
  }

  const opening = words.slice(0, 5).join(" ").toLowerCase();
  const rest = words.slice(5).join(" ").toLowerCase();

  return rest.includes(opening);
}

export function isOverviewLikeSource(page: PageSignals) {
  const internalLinks = page.item.internalLinks?.length ?? 0;
  const blocks = paragraphBlocks(page.body);
  const cardLikeBlocks = blocks.filter((block) => {
    return looksLikeTitleExcerptSentence(block) || repeatsOpeningPhrase(block);
  }).length;

  return internalLinks >= 8 || cardLikeBlocks >= 3;
}

export function phraseCandidates(content: string) {
  const candidates: Array<{ phrase: string; sentence: string }> = [];

  for (const sentence of sentenceTexts(content)) {
    const matches =
      sentence.match(/[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9'’/-]*/g) ?? [];

    for (let size = 2; size <= 7; size += 1) {
      for (let index = 0; index <= matches.length - size; index += 1) {
        candidates.push({
          phrase: matches.slice(index, index + size).join(" "),
          sentence,
        });
      }
    }
  }

  return candidates;
}

export function hasExactLowercaseOccurrence(phrase: string, sentence: string) {
  return sentence.toLowerCase().includes(phrase.toLowerCase());
}

export function hasTooManyStopwords(words: string[]) {
  const stopwordCount = words.filter((word) => {
    return ANCHOR_STOPWORDS.has(normalizeKeyword(word));
  }).length;

  return stopwordCount / words.length > 0.45;
}

export function isMostlyEditorialWords(keywords: string[]) {
  if (keywords.length === 0) {
    return true;
  }

  const editorialCount = keywords.filter((word) => EDITORIAL_WORDS.has(word)).length;

  return editorialCount / keywords.length >= 0.6;
}

export function hasWeirdCapitalBoundary(words: string[]) {
  return words.slice(1).some((word, index) => {
    const previous = words[index];

    return /^[A-ZÀ-Ý]/.test(word) && /^[a-zà-ÿ]/.test(previous);
  });
}

export function hasBoundaryLeakWords(anchor: string) {
  const normalizedWords = cleanText(anchor).split(/\s+/).map(normalizeKeyword);
  const boundaryWords = new Set(["which", "what", "where", "when", "how", "welke", "wat", "waar", "wanneer", "hoe"]);

  return normalizedWords.slice(1).some((word) => boundaryWords.has(word));
}

export function isFullLongTitle(anchor: string, target?: PageSignals) {
  if (!target) {
    return false;
  }

  return normalizeKeyword(anchor) === normalizeKeyword(target.title) && anchor.split(/\s+/).length > 5;
}

export function getFallbackAnchor(target: PageSignals | undefined, stats: KeywordStats) {
  if (!target) {
    return "";
  }

  const slugFallback = slugAnchor(target, stats);

  if (slugFallback) {
    return slugFallback;
  }

  const titleFallback = fallbackAnchorFromValue(target.title, target, stats);

  return isFullLongTitle(titleFallback, target) ? "" : titleFallback;
}

export function getFallbackAnchorSuggestion(
  source: PageSignals,
  target: PageSignals | undefined,
  stats: KeywordStats
): AnchorSuggestion | undefined {
  const fallback = getFallbackAnchor(target, stats);
  const score = scoreAnchorCandidate(fallback, source, target, stats, false);

  if (!fallback || score === 0) {
    return undefined;
  }

  return {
    text: fallback,
    confidence: "low",
    source: "fallback",
    score,
  };
}

export function anchorWords(anchor: string) {
  return new Set(keywordList(anchor));
}

export function intersectionSize(first: Set<string>, second: Set<string>) {
  let total = 0;

  for (const value of first) {
    if (second.has(value)) {
      total += 1;
    }
  }

  return total;
}

export function scoreAnchorCandidate(
  anchor: string,
  source: PageSignals,
  target?: PageSignals,
  stats?: KeywordStats,
  existsInSource = false,
  sentence?: string
) {
  const cleanAnchor = naturalAnchor(anchor);

  if (
    !cleanAnchor ||
    isFullLongTitle(cleanAnchor, target) ||
    hasBoundaryLeakWords(cleanAnchor)
  ) {
    return 0;
  }

  if (existsInSource && (!sentence || !hasExactLowercaseOccurrence(cleanAnchor, sentence))) {
    return 0;
  }

  const words = cleanAnchor.split(/\s+/);
  const anchorKeywordSet = anchorWords(cleanAnchor);
  const sourceOverlap = intersectionSize(anchorKeywordSet, topicKeywords(source));
  const targetOverlap = intersectionSize(anchorKeywordSet, topicKeywords(target));
  const distinctiveOverlap = stats
    ? intersectionSize(anchorKeywordSet, distinctiveTargetKeywords(target, stats))
    : targetOverlap;

  if (targetOverlap === 0 || distinctiveOverlap === 0) {
    return 0;
  }

  if (endsWithWeakAnchorWord(words) && distinctiveOverlap < 2) {
    return 0;
  }

  /*
   * Anchor scoring rewards target-specific phrase alignment. Existing phrases
   * get a small bonus, but fallback target anchors are the default selection
   * strategy so arbitrary source fragments do not dominate the report.
   */
  return (
    (existsInSource ? 10 : 0) +
    distinctiveOverlap * 45 +
    targetOverlap * 25 +
    sourceOverlap * 15 +
    (words.length >= 2 && words.length <= 5 ? 15 : 0) -
    (words.length > 5 ? 10 : 0) -
    (hasTooManyStopwords(words) ? 30 : 0)
  );
}

export function getBestExistingAnchor(
  source: PageSignals,
  target: PageSignals | undefined,
  stats: KeywordStats
) {
  const seen = new Set<string>();

  return phraseCandidates(source.body)
    .map((candidate) => {
      return {
        ...candidate,
        phrase: naturalAnchor(candidate.phrase),
      };
    })
    .filter((candidate) => Boolean(candidate.phrase))
    .filter((candidate) => {
      const key = normalizeKeyword(candidate.phrase);

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .map((candidate) => {
      return {
        text: candidate.phrase,
        confidence: "high" as const,
        source: "existing-phrase" as const,
        score: scoreAnchorCandidate(
          candidate.phrase,
          source,
          target,
          stats,
          true,
          candidate.sentence
        ),
      };
    })
    .filter((anchor) => anchor.score > 0)
    .sort((a, b) => b.score - a.score || a.text.length - b.text.length)[0];
}

export function getAnchorSuggestion(
  opportunity: LinkOpportunity,
  source: PageSignals,
  target: PageSignals | undefined,
  stats: KeywordStats
): AnchorSuggestion | undefined {
  const fallbackAnchor = getFallbackAnchorSuggestion(source, target, stats);

  if (!ENABLE_EXISTING_PHRASE_ANCHORS) {
    return fallbackAnchor;
  }

  const existingAnchor = getBestExistingAnchor(source, target, stats);

  if (
    existingAnchor &&
    fallbackAnchor &&
    existingAnchor.score >= fallbackAnchor.score + EXISTING_ANCHOR_SCORE_MARGIN
  ) {
    return existingAnchor;
  }

  if (fallbackAnchor) {
    return fallbackAnchor;
  }

  const secondaryFallback = (opportunity.suggestedAnchors ?? [])
    .map((candidate) => naturalAnchor(candidate))
    .filter(Boolean)
    .map((candidate) => {
      return {
        text: candidate,
        confidence: "low" as const,
        source: "fallback" as const,
        score: scoreAnchorCandidate(candidate, source, target, stats, false),
      };
    })
    .filter((anchor) => anchor.score > 0)
    .sort((a, b) => b.score - a.score || a.text.length - b.text.length)[0];

  if (secondaryFallback) {
    return secondaryFallback;
  }

  return existingAnchor
    ? {
        ...existingAnchor,
        confidence: "low",
      }
    : undefined;
}

export function getAnchorActionLabel(anchor?: AnchorSuggestion) {
  return anchor?.source === "existing-phrase" && anchor.confidence === "high"
    ? "Use existing phrase"
    : "Suggested anchor idea";
}
