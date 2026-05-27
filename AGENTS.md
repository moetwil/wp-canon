# AGENTS.md

WP Canon turns WordPress sites into AI-ready local content repos and SEO/content intelligence reports.

The goal is to give Claude/Codex structured, low-token context instead of scraped website pages.

## Core Rule

Build a generic local-first WordPress tool, not a site-specific script.

Never hardcode:
- client names
- project names
- site-specific slugs
- URLs
- niche/domain terms like medical, legal, ecommerce, rugpijn, etc.

Test datasets may be used for validation only. If a word is common in one site, detect that dynamically from the corpus or make it configurable.

## Current Architecture

- `scripts/discover.ts` connects to WordPress, discovers REST post types, writes `config/content-types.json`, and scaffolds `content/` folders.
- `scripts/pull.ts` reads discovered post types, pulls content from WordPress, cleans minimal block noise, and writes markdown files under `content/{restBase}/`.
- `scripts/index.ts` scans local markdown and writes `data/content-index.json` with metadata, internal links, clusters, and link opportunities.
- `scripts/quick-wins.ts` reads `data/content-index.json` and local markdown files, then writes `reports/quick-wins.md`.
- Shared helpers live in `scripts/lib/`.
- Docs live in `docs/`.

## Development Principles

- Keep token usage low.
- Prefer small, focused scripts.
- Prefer simple filesystem-based workflows.
- Avoid unnecessary abstractions.
- Use existing helpers in `scripts/lib` before adding new ones.
- Do not add dependencies unless clearly needed.
- Do not add dashboards, auth, databases, SaaS logic, or external APIs unless explicitly requested.
- Keep commits small and focused.
- Preserve flexibility for posts, pages, custom post types, custom permalink structures, and multilingual sites.
- Prefer composable scripts over monolithic pipelines.
- Keep markdown files as the local source of truth.
- Put configurable heuristics and language rules in `config/` where possible.
- Avoid hidden magic; prefer inspectable outputs and deterministic logic.

## SEO Heuristics

- Prefer quality over quantity.
- Avoid noisy recommendations.
- Internal link suggestions must avoid self-links.
- Anchor text must be natural, topic-specific, and not arbitrary sentence fragments.
- Domain-specific broad terms must be detected dynamically, not hardcoded.
- Language-specific stopwords/generic anchors should live in language packs or config.
- Reports should be Markdown-first, actionable, editor-friendly, and easy to copy into Trello.

## Generated Files

Do not commit generated or local environment files unless explicitly requested:

- `.env`
- `content/`
- `data/content-index.json`
- `reports/`
- large exports or client datasets

## Validation

After code changes, run:

```bash
npx tsc --noEmit
```

And the relevant command, for example:
```bash
npm run quick-wins
```

When possible, validate on:

1. the small dev/sample dataset
2. a real cloned dataset

## Agent Output Expectations

After making changes, summarize:

* changed files
* commands run
* assumptions made
* known limitations
* suggested next small improvement