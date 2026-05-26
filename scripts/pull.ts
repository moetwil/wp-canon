import { mkdir, readFile, writeFile } from "fs/promises";
import dotenv from "dotenv";
import matter from "gray-matter";

dotenv.config({ quiet: true });

const WP_URL = process.env.WP_URL?.replace(/\/$/, "");
const WP_USERNAME = process.env.WP_USERNAME;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

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
  if (!WP_URL) {
    throw new Error("Missing WP_URL in .env");
  }
  if (!WP_USERNAME) {
    throw new Error("Missing WP_USERNAME in .env");
  }
  if (!WP_APP_PASSWORD) {
    throw new Error("Missing WP_APP_PASSWORD in .env");
  }

  let postsUrl;

  try {
    await fetchJson(`${WP_URL}/wp-json`);
    postsUrl = `${WP_URL}/wp-json/wp/v2/posts?per_page=100`;
  } catch {
    postsUrl = `${WP_URL}/?rest_route=/wp/v2/posts&per_page=100`;
  }

  const config = JSON.parse(await readFile("config/content-types.json", "utf8"));
  const postType = config.postTypes.find((type: any) => type.slug === "post");

  if (!postType) {
    throw new Error('Missing post type "post" in config/content-types.json');
  }

  const auth = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString(
    "base64"
  );
  const posts = await fetchJson(postsUrl, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  await mkdir(`content/${postType.restBase}`, { recursive: true });

  for (const post of posts) {
    const markdown = matter.stringify(post.content.rendered, {
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

  console.log(`Saved ${posts.length} posts`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
