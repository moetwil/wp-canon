import { mkdir, writeFile } from "fs/promises";
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
  const data = await fetchJson(apiBase.root);
  const authHeaders = getAuthHeaders();
  const user = await fetchJson(`${apiBase.wpV2}/users/me`, {
    headers: authHeaders,
  });

  console.log("Connected to WordPress");
  console.log("Site name:", data.name);
  console.log("URL:", data.url);
  console.log("Authenticated as:", user.name);
  console.log("User slug:", user.slug);

  const types = await fetchJson(
    `${apiBase.wpV2}/types${apiBase.query}context=edit`,
    {
      headers: authHeaders,
    }
  );
  const postTypes = Object.entries(types).filter(([, type]: [string, any]) => {
    return type.viewable === true && type.rest_base;
  }).map(([slug, type]: [string, any]) => {
    return {
      slug,
      restBase: type.rest_base,
      name: type.name,
      taxonomies: type.taxonomies ?? [],
    };
  });

  console.log("Discovered post types:");
  for (const postType of postTypes) {
    console.log(`- ${postType.slug} → ${postType.restBase} (${postType.name})`);
  }

  const taxonomiesData = await fetchJson(
    `${apiBase.wpV2}/taxonomies${apiBase.query}context=edit`,
    {
      headers: authHeaders,
    }
  );
  const taxonomies = Object.entries(taxonomiesData)
    .filter(([, taxonomy]: [string, any]) => {
      return taxonomy.visibility?.show_in_rest === true && taxonomy.rest_base;
    })
    .map(([slug, taxonomy]: [string, any]) => {
      return {
        slug,
        restBase: taxonomy.rest_base,
        name: taxonomy.name,
        hierarchical: taxonomy.hierarchical === true,
        types: taxonomy.types ?? [],
      };
    });

  console.log("Discovered taxonomies:");
  for (const taxonomy of taxonomies) {
    console.log(`- ${taxonomy.slug} → ${taxonomy.restBase} (${taxonomy.name})`);
  }

  await mkdir("config", { recursive: true });
  await writeFile(
    "config/content-types.json",
    JSON.stringify(
      {
        postTypes,
        taxonomies,
      },
      null,
      2
    )
  );
  console.log("Saved config/content-types.json");

  await mkdir("content", { recursive: true });
  for (const postType of postTypes) {
    await mkdir(`content/${postType.restBase}`, { recursive: true });
  }
  console.log("Scaffolded content folders");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
