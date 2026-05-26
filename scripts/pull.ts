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

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, "").trim();
}

function getPostTerms(post: any, taxonomies: any[]) {
  const terms: Record<string, number[]> = {};

  for (const taxonomy of taxonomies) {
    const values = post[taxonomy.restBase] ?? post[taxonomy.slug] ?? [];

    terms[taxonomy.slug] = Array.isArray(values) ? values : [];
  }

  return terms;
}

async function main() {
  const apiBase = await getApiBase();
  const config = JSON.parse(await readFile("config/content-types.json", "utf8"));
  const postTypes = config.postTypes.filter((type: any) => {
    return type.restBase !== "media";
  });
  const taxonomies = config.taxonomies ?? [];
  const authHeaders = getAuthHeaders();
  const taxonomyTerms = [];
  let totalSaved = 0;

  await mkdir("data", { recursive: true });
  for (const taxonomy of taxonomies) {
    const terms = await fetchJson(
      `${apiBase.wpV2}/${taxonomy.restBase}${apiBase.query}per_page=100`,
      {
        headers: authHeaders,
      }
    );

    taxonomyTerms.push({
      taxonomy: taxonomy.slug,
      restBase: taxonomy.restBase,
      name: taxonomy.name,
      hierarchical: taxonomy.hierarchical,
      terms: terms.map((term: any) => {
        return {
          id: term.id,
          slug: term.slug,
          name: term.name,
          parent: term.parent ?? 0,
          count: term.count ?? 0,
          link: term.link,
        };
      }),
    });
  }

  await writeFile(
    "data/taxonomy-terms.json",
    JSON.stringify(
      {
        taxonomies: taxonomyTerms,
      },
      null,
      2
    )
  );

  for (const postType of postTypes) {
    const postTypeTaxonomies = taxonomies.filter((taxonomy: any) => {
      return taxonomy.types?.includes(postType.slug);
    });
    const posts = await fetchJson(
      `${apiBase.wpV2}/${postType.restBase}${apiBase.query}per_page=100`,
      {
        headers: authHeaders,
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
        excerpt: stripHtml(post.excerpt?.rendered ?? ""),
        date: post.date,
        modified: post.modified,
        categories: post.categories ?? [],
        tags: post.tags ?? [],
        taxonomies: getPostTerms(post, postTypeTaxonomies),
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
