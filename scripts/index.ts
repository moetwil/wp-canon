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

async function main() {
  if (!WP_URL) {
    throw new Error("Missing WP_URL in .env");
  }

  const files = await findMarkdownFiles("content");
  const items = [];

  for (const path of files) {
    const file = await readFile(path, "utf8");
    const parsed = matter(file);

    items.push({
      title: parsed.data.title,
      slug: parsed.data.slug,
      type: parsed.data.type,
      restBase: parsed.data.restBase,
      status: parsed.data.status,
      path,
      internalLinks: extractInternalLinks(parsed.content, WP_URL),
    });
  }

  await mkdir("data", { recursive: true });
  await writeFile(
    "data/content-index.json",
    JSON.stringify(
      {
        items,
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
