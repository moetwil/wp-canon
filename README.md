# WP Canon

Turn a WordPress site into an AI-ready content repo.

## What It Does

- Connects to the WordPress REST API
- Discovers post types and taxonomies
- Scaffolds content folders
- Pulls posts into markdown
- Generates content and term indexes

## Why This Exists

- Cleaner context for Claude/Codex
- Fewer tokens than scraping websites
- Structured content as source material

## Quick Start

```sh
npm install
cp .env.example .env
npm run discover
npm run pull
npm run index
npm run quick-wins
```

Edit `.env` before running the scripts:

```env
WP_URL=http://localhost:8080
WP_USERNAME=admin
WP_APP_PASSWORD=your application password
```

`npm run pull` also generates `data/taxonomy-terms.json` with REST-visible term names, slugs, parents, and links. `npm run index` generates `data/content-index.json` with each item's title, slug, type, status, local file path, terms, internal links, and a compact `termIndex` that maps taxonomy terms back to local content. This gives Claude/Codex a low-token overview of the website and its SEO relationships.

## Reports And Tasks

Generate the general content graph report:

```sh
npm run report
```

Generate a practical SEO quick-wins report:

```sh
npm run quick-wins
```

This writes `reports/quick-wins.md` with prioritized internal links, orphan/low-link pages, weak metadata checks, content structure checks, and a short "Do these first" list.

Generate agent-friendly task files:

```sh
npm run tasks
```

## Local WordPress Development

Requirements:

- Docker installed

Start local WordPress:

```sh
cd docker
docker compose up -d
```

Open:

```text
http://localhost:8080
```

Install WordPress manually. Recommended local credentials:

```text
username: admin
password: admin
```

Create an Application Password:

```text
Users -> Profile -> Application Passwords
```

The Docker WordPress setup includes a local development mu-plugin that enables Application Passwords over HTTP. This Docker setup is for local development only.

## Safety

Do not commit `.env`, content output, or data output.

## Roadmap

- Custom post type pulling
- Better markdown cleanup
- Better taxonomy and relationship index
- Draft push back to WordPress
- WooCommerce module
- SEO plugin metadata support
