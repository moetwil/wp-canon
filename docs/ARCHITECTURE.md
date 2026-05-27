# Architecture

WP Canon is a local-first WordPress SEO/content intelligence toolkit.

The system converts WordPress content into structured local markdown files and generates reports from those files without depending on live website scraping.

## High-Level Flow

```text
WordPress REST API
        ↓
discover.ts
        ↓
config/content-types.json
        ↓
pull.ts
        ↓
content/{postType}/
        ↓
index.ts
        ↓
data/content-index.json
        ↓
report scripts
        ↓
reports/*.md
```

## Core Principles

- Markdown files are the local source of truth.
- Scripts should be deterministic and inspectable.
- Prefer local heuristics over external APIs.
- Keep architecture generic for any WordPress site.
- Support posts, pages, and custom post types.
- Reports should be human-readable and editor-friendly.

## Main Scripts

### `scripts/discover.ts`

Responsibilities:
- connect to WordPress
- discover REST-enabled post types
- generate `config/content-types.json`
- scaffold content folders

### `scripts/pull.ts`

Responsibilities:
- fetch content from WordPress
- normalize/sanitize minimal block noise
- write markdown files into `content/`

### `scripts/index.ts`

Responsibilities:
- scan local markdown files
- extract metadata
- build internal-link graph
- generate semantic relationships
- generate `data/content-index.json`

### `scripts/quick-wins.ts`

Responsibilities:
- analyze indexed content
- detect SEO/content opportunities
- generate actionable markdown reports
- identify:
  - internal link opportunities
  - orphan pages
  - metadata issues
  - thin content
  - structural issues

## Main Directories

### `content/`

Local markdown content grouped by post type.

Example:

```text
content/posts/
content/pages/
content/product/
```

### `config/`

Configurable project files.

Example:

```text
config/content-types.json
config/semantic.json
config/language-packs/
```

### `data/`

Generated machine-readable data.

Example:

```text
data/content-index.json
```

### `reports/`

Generated human-readable reports.

Example:

```text
reports/quick-wins.md
```

### `scripts/lib/`

Reusable helpers shared across scripts.

## Heuristics

SEO heuristics should:
- remain generic
- avoid site-specific hardcoding
- prefer dynamic detection from the content corpus
- move configurable behavior into `config/` when possible

## Future Direction

Possible future modules:
- Search Console integration
- configurable language packs
- semantic clustering improvements
- AI-assisted content briefs
- markdown publishing back to WordPress