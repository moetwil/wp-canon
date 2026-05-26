import dotenv from "dotenv";

dotenv.config();

const WP_URL = process.env.WP_URL?.replace(/\/$/, "");

async function fetchJson(url: string) {
  const response = await fetch(url);

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

  let data;

  try {
    data = await fetchJson(`${WP_URL}/wp-json`);
  } catch {
    console.log("Pretty REST URL failed, trying fallback...");
    data = await fetchJson(`${WP_URL}/?rest_route=/`);
  }

  console.log("Connected to WordPress");
  console.log("Site name:", data.name);
  console.log("Description:", data.description);
  console.log("URL:", data.url);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});