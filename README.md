# WP Canon

Turn a WordPress site into a local, AI-ready content repo.

WP Canon pulls your WordPress content into structured markdown and generates lightweight indexes, reports, and SEO task data that work well with Claude, Codex, ChatGPT, and other coding agents.

The goal is simple:

- own your website content locally
- reduce token usage
- give AI agents structured context instead of scraped HTML
- build reproducible SEO/content workflows

---

# What It Does

WP Canon currently supports:

- WordPress REST API discovery
- Post type and taxonomy detection
- Markdown content export
- Taxonomy relationship mapping
- Internal link indexing
- SEO/content reports
- Agent-friendly task generation

Outputs are designed for:
- Claude
- Codex
- ChatGPT
- local AI workflows
- SEO automation
- content audits
- Git-based content pipelines

---

# Why This Exists

Most AI workflows for WordPress are still:
- copy/paste based
- scraping based
- noisy
- token expensive
- difficult to reproduce

WP Canon creates a structured local content layer instead.

Instead of giving an AI model raw website HTML, you give it:
- markdown content
- metadata
- taxonomy relationships
- internal link graphs
- quick-win reports
- task files

This produces:
- cleaner prompts
- lower token usage
- more reliable output
- easier automation

---

# Quick Start

Install dependencies:

sh npm install 

Create your environment file:

sh cp .env.example .env 

Configure WordPress credentials:

env WP_URL=http://localhost:8080 WP_USERNAME=admin WP_APP_PASSWORD=your application password 

Run the pipeline:

sh npm run discover npm run pull npm run index npm run quick-wins 

---

# Pipeline Overview

## 1. Discover

sh npm run discover 

Discovers:
- post types
- taxonomies
- REST API structure

Outputs:
- data/discovery.json

---

## 2. Pull

sh npm run pull 

Pulls WordPress content into local markdown files.

Outputs:
- content/
- data/taxonomy-terms.json

Each markdown file includes:
- title
- slug
- metadata
- original URL
- cleaned content

---

## 3. Index

sh npm run index 

Builds a lightweight content graph.

Outputs:
- data/content-index.json

Includes:
- titles
- slugs
- local paths
- taxonomies
- internal links
- orphan detection
- term relationships
- semantic grouping signals

This file is designed specifically for AI agents and low-token context loading.

---

## 4. Quick Wins

sh npm run quick-wins 

Generates a practical SEO/content audit.

Outputs:
- reports/quick-wins.md

Includes:
- internal link opportunities
- orphan pages
- weak metadata
- thin content
- heading structure issues
- prioritized action lists

The report is deterministic and designed for safe human review.

---

## 5. Tasks

sh npm run tasks 

Generates agent-friendly task files that can be consumed by:
- Claude
- Codex
- Cursor
- ChatGPT
- custom automation

---

# Example AI Workflow

Example Claude/Codex prompt:

text Using data/content-index.json and reports/quick-wins.md:  - identify the highest-value orphan pages - suggest internal links - propose improved meta titles - do not invent URLs or content - only use files from content/ 

---

# Local WordPress Development

Requirements:
- Docker

Start local WordPress:

sh cd docker docker compose up -d 

Open:

text http://localhost:8080 

Recommended local credentials:

text username: admin password: admin 

Create an Application Password:

text Users -> Profile -> Application Passwords 

The included local mu-plugin enables Application Passwords over HTTP for local development only.

---

# Project Philosophy

WP Canon is intentionally:

- local-first
- markdown-first
- deterministic where possible
- automation-friendly
- Git-friendly
- AI-agent-friendly

The project is not trying to replace SEO tools or become a fully autonomous SEO agent.

It is a structured content layer for developers, agencies, and AI workflows.

---

# Current Status

WP Canon is early-stage but already useful for:

- agencies
- technical SEO
- AI-assisted content workflows
- WordPress migrations
- content auditing
- internal linking workflows
- local AI experimentation

The project is not yet production-grade automation software.

Human review is still expected.

---

# Safety

Do not commit:
- .env
- generated content
- generated data
- reports

Recommended .gitignore entries:

gitignore .env content/ data/ reports/ 

---

# Roadmap

Planned improvements:

- push drafts back to WordPress
- configurable heuristics
- plugin architecture
- WooCommerce support
- better markdown normalization
- configurable language packs
- snapshot tests
- semantic clustering improvements
- automatic fix generation
- GitHub Actions integration
- AI task pipelines

---

# Contributing

Issues, ideas, and pull requests are welcome.

The long-term goal is to make WordPress content easier to work with in modern AI-assisted development workflows.