import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import dotenv from "dotenv";
import matter from "gray-matter";

dotenv.config({ quiet: true });

const WP_URL = process.env.WP_URL;

function extractInternalLinks(content: string, siteUrl: string) {
  const links = content.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  const siteHostname = new URL(siteUrl).hostname;

  return links.filter((link) => {
    try {
      return new URL(link).hostname === siteHostname;
    } catch {
      return false;
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
  if (data.taxonomies) {
    return data.taxonomies;
  }

  return {
    category: data.categories ?? [],
    post_tag: data.tags ?? [],
  };
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
  const items = [];

  for (const taxonomy of taxonomyData.taxonomies) {
    for (const term of taxonomy.terms) {
      termsByKey.set(`${taxonomy.taxonomy}:${term.id}`, {
        taxonomy: taxonomy.taxonomy,
        id: term.id,
        slug: term.slug,
        name: term.name,
        parent: term.parent,
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
      terms,
      internalLinks: extractInternalLinks(parsed.content, WP_URL),
    });
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
