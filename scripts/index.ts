import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import dotenv from "dotenv";
import matter from "gray-matter";

dotenv.config({ quiet: true });

const WP_URL = process.env.WP_URL;

function comparableHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function normalizeInternalUrl(value: string, siteUrl: string) {
  const site = new URL(siteUrl);
  const url = new URL(value, `${site.origin}/`);

  if (comparableHostname(url.hostname) !== comparableHostname(site.hostname)) {
    return null;
  }

  url.protocol = site.protocol;
  url.host = site.host;

  return url.href;
}

function comparableUrl(value: string, siteUrl: string) {
  const normalized = normalizeInternalUrl(value, siteUrl);

  if (!normalized) {
    return null;
  }

  const url = new URL(normalized);
  url.hash = "";

  return url.href;
}

function extractInternalLinks(content: string, siteUrl: string) {
  const links = new Set<string>();
  const hrefPattern = /href=(["'])(.*?)\1/gi;
  const absolutePattern = /https?:\/\/[^\s"'<>]+/g;

  for (const match of content.matchAll(hrefPattern)) {
    links.add(match[2]);
  }

  for (const match of content.matchAll(absolutePattern)) {
    links.add(match[0]);
  }

  return Array.from(links).flatMap((link) => {
    const value = link.trim();
    const lowerValue = value.toLowerCase();

    if (
      !value ||
      value.startsWith("#") ||
      lowerValue.startsWith("mailto:") ||
      lowerValue.startsWith("tel:") ||
      lowerValue.startsWith("javascript:")
    ) {
      return [];
    }

    try {
      const url = normalizeInternalUrl(value, siteUrl);

      return url ? [url] : [];
    } catch {
      return [];
    }
  });
}

async function readJson(path: string, fallback: any) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function findMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = `${dir}/${entry.name}`;

    if (entry.isDirectory()) {
      files.push(...(await findMarkdownFiles(path)));
    } else if (entry.name !== ".gitkeep" && entry.name.endsWith(".md")) {
      files.push(path);
    }
  }

  return files;
}

function getRawTerms(data: any) {
  return {
    category: data.categories ?? [],
    post_tag: data.tags ?? [],
    ...(data.taxonomies ?? {}),
  };
}

function getLinkedFrom(item: any, items: any[]) {
  const targets = [item.url, item.slug].filter(Boolean);

  return items
    .filter((source) => {
    if (source.path === item.path) {
      return false;
    }

    return source.internalLinks.some((link: string) => {
      return targets.some((target) => link.includes(target));
    });
    })
    .map((source) => source.path);
}

function getBrokenInternalLinks(
  item: any,
  indexedUrls: Set<string>,
  indexedSlugs: Set<string>
) {
  return item.internalLinks.filter((link: string) => {
    const url = comparableUrl(link, WP_URL!);

    if (url && indexedUrls.has(url)) {
      return false;
    }

    const pathParts = new URL(link).pathname.split("/").filter(Boolean);

    return !pathParts.some((part) => indexedSlugs.has(part));
  });
}

async function main() {
  if (!WP_URL) {
    throw new Error("Missing WP_URL in .env");
  }

  const files = await findMarkdownFiles("content");
  const taxonomyData = await readJson("data/taxonomy-terms.json", {
    taxonomies: [],
  });
  const termsByKey = new Map<string, any>();
  const termItems = new Map<string, any>();
  const items: any[] = [];

  for (const taxonomy of taxonomyData.taxonomies) {
    const taxonomySlug = taxonomy.slug ?? taxonomy.taxonomy;

    for (const term of taxonomy.terms) {
      termsByKey.set(`${taxonomySlug}:${term.id}`, {
        taxonomy: taxonomySlug,
        id: term.id,
        slug: term.slug,
        name: term.name,
        link: term.link,
      });
    }
  }

  for (const path of files) {
    const file = await readFile(path, "utf8");
    const parsed = matter(file);
    const terms = [];

    for (const [taxonomy, ids] of Object.entries(getRawTerms(parsed.data))) {
      if (!Array.isArray(ids)) {
        continue;
      }

      for (const id of ids) {
        const term =
          termsByKey.get(`${taxonomy}:${id}`) ?? {
            taxonomy,
            id,
          };

        terms.push(term);

        const relationshipKey = `${taxonomy}:${id}`;
        const relationship = termItems.get(relationshipKey) ?? {
          taxonomy,
          id,
          slug: term.slug,
          name: term.name,
          items: [],
        };

        relationship.items.push(path);
        termItems.set(relationshipKey, relationship);
      }
    }

    items.push({
      title: parsed.data.title,
      slug: parsed.data.slug,
      type: parsed.data.type,
      restBase: parsed.data.restBase,
      status: parsed.data.status,
      path,
      url: normalizeInternalUrl(parsed.data.link, WP_URL),
      terms,
      internalLinks: extractInternalLinks(parsed.content, WP_URL),
    });
  }

  const indexedUrls = new Set(
    items.flatMap((item) => {
      const url = item.url ? comparableUrl(item.url, WP_URL) : null;

      return url ? [url] : [];
    })
  );
  const indexedSlugs = new Set(items.map((item) => item.slug).filter(Boolean));

  for (const item of items) {
    item.linkedFrom = getLinkedFrom(item, items);
    item.brokenInternalLinks = getBrokenInternalLinks(
      item,
      indexedUrls,
      indexedSlugs
    );
    item.orphan = item.linkedFrom.length === 0;
    delete item.url;
  }

  await mkdir("data", { recursive: true });
  await writeFile(
    "data/content-index.json",
    JSON.stringify(
      {
        items,
        termIndex: Array.from(termItems.values()),
      },
      null,
      2
    )
  );

  console.log(`Indexed ${items.length} items`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
