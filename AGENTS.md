# AGENTS.md

WP Canon turns WordPress sites into AI-ready local content repos. The goal is to give Claude/Codex structured, low-token context instead of scraped website pages.

## Current Architecture

- `scripts/discover.ts` connects to WordPress, discovers REST post types, writes `config/content-types.json`, and scaffolds `content/` folders.
- `scripts/pull.ts` reads discovered post types, pulls content from WordPress, cleans minimal block noise, and writes markdown files under `content/{restBase}/`.
- `scripts/index.ts` scans local markdown and writes `data/content-index.json` with metadata and internal links.
- Shared helpers live in `scripts/lib/`.

## Development Principles

- Keep token usage low.
- Prefer small, focused scripts.
- Prefer simple filesystem-based workflows.
- Avoid unnecessary abstractions.
- Use existing helpers in `scripts/lib` before adding new ones.
- Do not add dependencies unless clearly needed.
- Do not commit generated content, data output, or `.env` files.
- Keep commits small and focused.
- Preserve flexibility for custom post types and future modules.
