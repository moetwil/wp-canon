export type LinkOpportunity = {
  target?: string;
  reason?: string;
  relevanceScore?: number;
  suggestedAnchors?: string[];
};

export type IndexItem = {
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

export type ContentIndex = {
  items?: IndexItem[];
};

export type PageSignals = {
  item: IndexItem;
  url?: string;
  canonicalUrl?: string;
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

export type RankedOpportunity = LinkOpportunity & {
  source: PageSignals;
  targetPage?: PageSignals;
  anchor?: AnchorSuggestion;
  insertion?: InsertionSuggestion;
  targetSpecificityScore: number;
  anchorAlignmentScore: number;
};

export type AnchorSuggestion = {
  text: string;
  confidence: "high" | "low";
  source: "existing-phrase" | "fallback";
  score: number;
};

export type InsertionSuggestion = {
  context: string;
  score: number;
};

export type Issue = {
  page: PageSignals;
  issue: string;
  action: string;
  score: number;
};

export type PriorityItem = {
  title: string;
  action: string;
  score: number;
  ease: string;
};

export type KeywordStats = {
  pageCount: number;
  documentFrequency: Map<string, number>;
};

export type AnchorLanguagePack = {
  genericAnchors: string[];
  fallbackAnchorFillerWords: string[];
  stopwords: string[];
  weakAnchorStartWords: string[];
  weakAnchorEndWords: string[];
};

