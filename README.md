# WP Canon

Turn a WordPress site into an AI-ready content repo.

## What It Does

- Connects to the WordPress REST API
- Discovers post types
- Scaffolds content folders
- Pulls posts into markdown
- Generates a content index

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
```

Edit `.env` before running the scripts:

```env
WP_URL=http://localhost:8080
WP_USERNAME=admin
WP_APP_PASSWORD=your application password
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
- Internal link index
- Draft push back to WordPress
- WooCommerce module
- SEO plugin metadata support
