# Development

## Requirements

- Node.js
- npm
- WordPress site with REST API access

## Install

```bash
npm install
```

## Environment

Copy:

```bash
cp .env.example .env
```

Fill in WordPress credentials locally.

Never commit `.env`.

---

# Common Commands

## Discover content types

```bash
npm run discover
```

## Pull WordPress content

```bash
npm run pull
```

## Build local content index

```bash
npm run index
```

## Generate quick wins report

```bash
npm run quick-wins
```

## Typecheck

```bash
npx tsc --noEmit
```

---

# Recommended Workflow

## 1. Make small focused changes

Avoid large rewrites.

Prefer:
- isolated heuristics
- reusable helpers
- composable scripts

---

## 2. Validate locally

Run:

```bash
npx tsc --noEmit
```

Then run the relevant script:

```bash
npm run quick-wins
```

---

## 3. Test on two datasets

### Small sample/dev dataset

Fast validation.

### Real cloned dataset

Real-world quality validation.

---

## 4. Review generated output

Check:
- markdown readability
- noisy recommendations
- false positives
- site-specific leakage
- generic behavior

---

# Git Workflow

## Check changes

```bash
git status
git diff
```

## Commit

```bash
git add .
git commit -m "short descriptive message"
```

## Push

```bash
git push
```

---

# Generated Files

Do not commit:

```text
.env
content/
data/content-index.json
reports/
```

Unless explicitly intended.

---

# Development Philosophy

- local-first
- deterministic
- low-token
- inspectable outputs
- minimal dependencies
- generic WordPress support
- markdown-first workflows