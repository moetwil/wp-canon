# SEO Heuristics

This document describes the philosophy behind SEO scoring and recommendations inside WP Canon.

The goal is actionable signal, not noisy automation.

---

# General Principles

- Prefer quality over quantity.
- Avoid overwhelming reports.
- Avoid obvious SEO spam patterns.
- Keep recommendations human-reviewable.
- Keep logic generic for any WordPress site.

---

# Internal Linking

## Good Internal Links

A good suggestion:
- is contextually relevant
- matches the target topic closely
- uses natural anchor text
- avoids arbitrary fragments
- avoids self-links

## Bad Internal Links

Avoid:
- generic anchors
- sentence fragments
- repeated boilerplate
- CTA text
- overview-card excerpts
- links based only on broad shared words

---

# Broad vs Distinctive Keywords

Broad/common terms should be detected dynamically from the corpus.

Examples:
- "guide"
- "tips"
- "blog"

These should not dominate scoring.

Distinctive target keywords should carry more weight.

---

# Anchor Text Rules

Prefer:
- concise noun/topic phrases
- target-specific wording
- naturally occurring phrases

Avoid:
- arbitrary sentence fragments
- pronoun-heavy phrases
- weak endings
- generic section labels

Fallback anchors:
- prefer the target slug over the target title
- convert slugs to lowercase readable phrases
- remove language-pack filler or intent words
- keep original word order
- prefer 2-5 word topic phrases
- trim broad corpus terms only when a distinctive leading phrase remains
- use the target title only when the slug is missing or unusable

Existing phrase anchors:
- are currently disabled by default in quick-wins output
- may find phrases that already appear in the source page, but those phrases can still be editorially weak or too sentence-like
- are kept in the codebase for future use behind configuration

Quick-wins currently prefers slug/title-derived fallback anchors for reliability. Reports label these as `Suggested anchor idea` so editors can place or adapt the anchor naturally inside the suggested insertion context.

---

# Metadata Checks

Current metadata checks:
- title length
- description length
- missing metadata
- optional focus keyword presence

Future:
- CTR optimization
- title uniqueness
- intent alignment

---

# Thin Content

Thin content should:
- be informationally weak
- lack depth
- lack structure

Word count alone should not fully determine quality.

---

# Orphan Pages

Pages with low internal links may:
- struggle to rank
- receive little crawl attention
- lack topical integration

Suggestions should prioritize:
- relevant hubs
- strong semantic overlap
- existing topical clusters

---

# Configurability

Heuristics should become configurable where possible:

```text
config/
config/language-packs/
config/semantic.json
```

Avoid hardcoded domain-specific logic.
