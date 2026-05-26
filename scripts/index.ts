import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import matter from "gray-matter";

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
