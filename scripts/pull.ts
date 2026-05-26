import { mkdir, readFile, writeFile } from "fs/promises";
import matter from "gray-matter";
import { cleanContent } from "./lib/cleanContent";
import { getApiBase, getAuthHeaders } from "./lib/wp";

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(
      `Request failed: ${response.status} ${response.statusText} (${url})`
    );
  }

  return response.json();
}

async function main() {
  const apiBase = await getApiBase();
  const config = JSON.parse(await readFile("config/content-types.json", "utf8"));
  const postTypes = config.postTypes.filter((type: any) => {
    return type.restBase !== "media";
  });
  let totalSaved = 0;

  for (const postType of postTypes) {
    const posts = await fetchJson(
      `${apiBase.wpV2}/${postType.restBase}${apiBase.query}per_page=100`,
      {
        headers: getAuthHeaders(),
      }
    );

    await mkdir(`content/${postType.restBase}`, { recursive: true });

    for (const post of posts) {
      const markdown = matter.stringify(cleanContent(post.content.rendered), {
        id: post.id,
        type: postType.slug,
        restBase: postType.restBase,
        slug: post.slug,
        status: post.status,
        title: post.title.rendered,
        link: post.link,
      });

      await writeFile(`content/${postType.restBase}/${post.slug}.md`, markdown);
    }

    totalSaved += posts.length;
  }

  console.log(`Saved ${totalSaved} items`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
