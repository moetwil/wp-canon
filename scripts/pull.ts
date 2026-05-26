import { mkdir, readFile, writeFile } from "fs/promises";
import matter from "gray-matter";
import { cleanContent } from "./lib/cleanContent";
import { fetchAllPages, getApiBase, getAuthHeaders } from "./lib/wp";

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, "").trim();
}

function getPostTerms(post: any, taxonomies: any[]) {
  const terms: Record<string, number[]> = {};

  for (const taxonomy of taxonomies) {
    const values = post[taxonomy.restBase] ?? post[taxonomy.slug] ?? [];

    terms[taxonomy.slug] = Array.isArray(values) ? [...values] : [];
  }

  return terms;
}

function getTaxonomies(config: any) {
  const configured = config.taxonomies ?? [];

  if (configured.length > 0) {
    return configured.filter((taxonomy: any) => taxonomy.restBase);
  }

  return [
    {
      slug: "category",
      restBase: "categories",
      name: "Categories",
      types: ["post"],
    },
    {
      slug: "post_tag",
      restBase: "tags",
      name: "Tags",
      types: ["post"],
    },
  ];
}

async function main() {
  const apiBase = await getApiBase();
  const config = JSON.parse(await readFile("config/content-types.json", "utf8"));
  const postTypes = config.postTypes.filter((type: any) => {
    return type.restBase !== "media";
  });
  const taxonomies = getTaxonomies(config);
  const authHeaders = getAuthHeaders();
  const taxonomyTerms = [];
  let totalSaved = 0;

  await mkdir("data", { recursive: true });
  for (const taxonomy of taxonomies) {
    const result = await fetchAllPages<any>(
      `${apiBase.wpV2}/${taxonomy.restBase}`,
      apiBase.query,
      {
        headers: authHeaders,
      }
    );
    const terms = result.items;

    taxonomyTerms.push({
      slug: taxonomy.slug,
      restBase: taxonomy.restBase,
      name: taxonomy.name,
      terms: terms.map((term: any) => {
        return {
          id: term.id,
          name: term.name,
          slug: term.slug,
          link: term.link,
        };
      }),
    });

    console.log(
      `Pulled ${terms.length} ${taxonomy.restBase} terms` +
        (result.total !== undefined ? ` (${result.total} reported)` : "")
    );
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
    const result = await fetchAllPages<any>(
      `${apiBase.wpV2}/${postType.restBase}`,
      apiBase.query,
      {
        headers: authHeaders,
      }
    );
    const posts = result.items;

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
    console.log(
      `Pulled ${posts.length} ${postType.restBase} items` +
        (result.total !== undefined ? ` (${result.total} reported)` : "")
    );
  }

  console.log(`Saved ${totalSaved} items`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
