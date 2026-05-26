> This document is a development snapshot of the current repository state. It may become outdated as the project evolves.

# WP Canon Current Repository State

WP Canon is a small TypeScript CLI toolkit that turns a WordPress site into a local, AI-readable content repository. It favors filesystem output over databases or dashboards: WordPress content is pulled into Markdown, indexed into compact JSON, then summarized into Markdown reports.

## Current Architecture

The project is organized as a sequence of scripts:

1. Discover the WordPress REST shape.
2. Pull WordPress content into local Markdown files.
3. Build a content graph/index from the local Markdown.
4. Generate a compact Markdown report from the index.

There is no web app, dashboard, API server, embedding pipeline, AI generation layer, or publishing workflow in the current codebase.

## Data Flow

```text
WordPress REST API
  -> scripts/discover.ts
  -> config/content-types.json
  -> scripts/pull.ts
  -> content/{restBase}/{slug}.md
  -> data/taxonomy-terms.json
  -> scripts/index.ts
  -> data/content-index.json
  -> scripts/report.ts
  -> reports/content-index-summary.md
```

## Implemented Systems

### WordPress Discovery

`scripts/discover.ts` connects to WordPress using the shared REST helper, authenticates with an Application Password, discovers REST-visible post types, discovers REST-visible taxonomies, writes `config/content-types.json`, and scaffolds matching folders under `content/`.

It records post type metadata such as `slug`, `restBase`, `name`, and attached `taxonomies`. It also records taxonomy metadata such as `slug`, `restBase`, `name`, `hierarchical`, and `types`.

### Pull/Ingestion

`scripts/pull.ts` reads `config/content-types.json`, fetches WordPress posts for each non-media post type, and writes Markdown files to `content/{restBase}/{slug}.md`.

Each Markdown file includes frontmatter with WordPress metadata:

- `id`
- `type`
- `restBase`
- `slug`
- `status`
- `title`
- `link`
- `excerpt`
- `date`
- `modified`
- `categories`
- `tags`
- `taxonomies`

The pull script also fetches taxonomy term metadata and writes `data/taxonomy-terms.json`.

### Formatting And Normalization

`scripts/lib/wp.ts` handles WordPress API base URL detection and authentication. It supports pretty REST URLs and falls back to `?rest_route=`.

`scripts/lib/cleanContent.ts` performs lightweight content cleanup:

- extracts inner HTML from the `eckb-article-content-body` wrapper when present
- removes Gutenberg block comments
- trims excessive blank lines

Markdown frontmatter is produced with `gray-matter`.

### Index Generation

`scripts/index.ts` scans local Markdown files under `content/` and writes `data/content-index.json`.

Current indexed item fields include:

- title, slug, type, restBase, status, path
- taxonomy terms
- normalized internal links
- content keywords
- semantic cluster
- inbound links via `linkedFrom`
- broken internal links
- link opportunities
- hub score
- orphan status

The index also includes a `termIndex` that maps taxonomy terms back to local content paths.

### Internal Link Analysis

The indexer extracts internal links from HTML content. It supports:

- absolute URLs
- root-relative URLs
- relative URLs
- www/non-www normalization against `WP_URL`

It ignores anchors-only links, `mailto:`, `tel:`, `javascript:`, WordPress system routes, preview/admin query URLs, uploads, images, PDFs, ZIPs, and common document assets.

The graph currently detects:

- outbound internal links
- inbound links (`linkedFrom`)
- orphan items
- broken internal links
- suggested internal link opportunities

### Semantic Analysis And Clustering

`scripts/index.ts` includes lightweight, dependency-free semantic analysis:

- keyword extraction from title, slug, h2/h3 headings, taxonomy names, and low-weight body text
- accent removal and lowercase normalization
- configurable stopwords and weak terms
- semantic cluster labels
- hub scoring
- link opportunity scoring
- suggested anchor text for link opportunities

Semantic filtering is configurable through `config/semantic.json`:

```json
{
  "language": "nl",
  "stopwords": [],
  "weakTerms": []
}
```

The script also supports `excludeFromOpportunities` if present in that config, although the default config file does not currently include that key.

### Scoring Systems

The current indexer computes:

- `hubScore`: based on inbound links, outbound links, and keyword overlap with other items
- `relevanceScore` inside link opportunities: based on shared slug keywords, title keywords, heading keywords, taxonomy terms, and same semantic cluster

These scores are heuristic. They are useful for triage, not a replacement for editorial review.

### Report Generation

`scripts/report.ts` reads `data/content-index.json` and writes `reports/content-index-summary.md`.

The report summarizes:

- overall content health
- strongest pages
- weakest pages
- orphaned or weakly linked content
- broken internal links
- cluster overview
- top actionable improvements

### Task Generation

There is no dedicated task generation system yet. The closest current feature is `scripts/report.ts`, which creates a short "Top Actionable Improvements" section from existing index data.

## CLI Scripts

Available npm scripts:

- `npm run discover`: discover WordPress post types/taxonomies and scaffold config/content folders
- `npm run pull`: pull WordPress content into Markdown and fetch taxonomy terms
- `npm run index`: build `data/content-index.json`
- `npm run report`: build `reports/content-index-summary.md`
- `npm test`: placeholder that exits with an error

## Important Files And Folders

- `scripts/discover.ts`: WordPress REST discovery
- `scripts/pull.ts`: WordPress content and taxonomy pulling
- `scripts/index.ts`: content graph and semantic index generation
- `scripts/report.ts`: Markdown report generation from the content index
- `scripts/lib/wp.ts`: shared WordPress URL/auth helpers
- `scripts/lib/cleanContent.ts`: HTML cleanup before Markdown writing
- `config/content-types.json`: discovered or sample content type configuration
- `config/semantic.json`: semantic filtering configuration
- `content/`: generated Markdown content output; ignored except `.gitkeep`
- `data/`: generated JSON output; ignored except `.gitkeep`
- `reports/`: generated Markdown reports
- `docker/`: local WordPress development environment
- `README.md`: project overview and quick start

## Generated Outputs

Generated outputs include:

- `content/{restBase}/{slug}.md`
- `data/taxonomy-terms.json`
- `data/content-index.json`
- `reports/content-index-summary.md`

The repository is configured to ignore generated `content/` and `data/` output. The `reports/` folder is currently present locally and not ignored.

## Local Development

Install dependencies:

```sh
npm install
```

Create and edit environment settings:

```sh
cp .env.example .env
```

Required environment variables:

```env
WP_URL=http://localhost:8080
WP_USERNAME=admin
WP_APP_PASSWORD=your application password
```

Optional local WordPress:

```sh
cd docker
docker compose up -d
```

Then run the pipeline:

```sh
npm run discover
npm run pull
npm run index
npm run report
```

## Incomplete Or Placeholder Systems

- `npm test` is still a placeholder.
- There is no formal test suite.
- There is no pagination handling beyond `per_page=100`, so larger sites may be incomplete.
- There is no retry/rate-limit handling for WordPress API calls.
- There is no incremental pull or deletion reconciliation.
- There is no push/publish workflow back to WordPress.
- There is no WooCommerce module.
- There is no SEO plugin metadata extraction yet.
- There is no AI API integration, embeddings, vector index, or automated generation.
- `scripts/index.ts` has grown into the largest script and contains several separate concerns in one file.

## Architectural Observations

The project is still intentionally simple: local files are the source of truth after pulling, and the content graph is regenerated from those files. That keeps the workflow easy to inspect and friendly to AI/code-agent context.

The strongest implemented system is the local content graph. It now goes beyond a plain list of pages and includes internal link structure, orphan detection, broken link detection, clusters, hub scores, and link opportunities.

The main architectural pressure point is `scripts/index.ts`. It now handles file scanning, URL normalization, semantic keyword extraction, cluster generation, scoring, link analysis, and opportunity generation. That is still workable, but it is becoming the natural next candidate for careful extraction into small helpers if development continues.

## Likely Next Development Step

The next logical step is to make the analysis more reliable before adding new features:

1. Add a small test suite around URL normalization, internal link extraction, broken link detection, semantic filtering, and opportunity scoring.
2. Add pagination support to `pull.ts` for real sites with more than 100 items or terms.
3. Consider splitting `scripts/index.ts` into focused modules once tests exist.

