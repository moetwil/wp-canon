import dotenv from "dotenv";

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

  let data;
  let usersMeUrl;
  let typesUrl;

  try {
    data = await fetchJson(`${WP_URL}/wp-json`);
    usersMeUrl = `${WP_URL}/wp-json/wp/v2/users/me`;
    typesUrl = `${WP_URL}/wp-json/wp/v2/types?context=edit`;
  } catch {
    console.log("Pretty REST URL failed, trying fallback...");
    data = await fetchJson(`${WP_URL}/?rest_route=/`);
    usersMeUrl = `${WP_URL}/?rest_route=/wp/v2/users/me`;
    typesUrl = `${WP_URL}/?rest_route=/wp/v2/types&context=edit`;
  }

  const auth = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString(
    "base64"
  );
  const user = await fetchJson(usersMeUrl, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  console.log("Connected to WordPress");
  console.log("Site name:", data.name);
  console.log("URL:", data.url);
  console.log("Authenticated as:", user.name);
  console.log("User slug:", user.slug);

  const types = await fetchJson(typesUrl, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });
  const postTypes = Object.entries(types).filter(([, type]: [string, any]) => {
    return type.viewable === true && type.rest_base;
  });

  console.log("Discovered post types:");
  for (const [slug, type] of postTypes as [string, any][]) {
    console.log(`- ${slug} → ${type.rest_base} (${type.name})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
