import dotenv from "dotenv";

dotenv.config({ quiet: true });

const WP_URL = process.env.WP_URL?.replace(/\/$/, "");
const WP_USERNAME = process.env.WP_USERNAME;
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD;

export async function getApiBase() {
  if (!WP_URL) {
    throw new Error("Missing WP_URL in .env");
  }

  const prettyUrl = `${WP_URL}/wp-json`;
  const response = await fetch(prettyUrl);

  if (response.ok) {
    return {
      root: prettyUrl,
      wpV2: `${prettyUrl}/wp/v2`,
      query: "?",
    };
  }

  console.log("Pretty REST URL failed, trying fallback...");
  return {
    root: `${WP_URL}/?rest_route=/`,
    wpV2: `${WP_URL}/?rest_route=/wp/v2`,
    query: "&",
  };
}

export function getAuthHeaders() {
  if (!WP_USERNAME) {
    throw new Error("Missing WP_USERNAME in .env");
  }
  if (!WP_APP_PASSWORD) {
    throw new Error("Missing WP_APP_PASSWORD in .env");
  }

  const auth = Buffer.from(`${WP_USERNAME}:${WP_APP_PASSWORD}`).toString(
    "base64"
  );

  return {
    Authorization: `Basic ${auth}`,
  };
}

type PaginatedResult<T> = {
  items: T[];
  total?: number;
  totalPages?: number;
};

function appendPageParams(
  url: string,
  querySeparator: string,
  page: number,
  perPage: number
) {
  return `${url}${querySeparator}per_page=${perPage}&page=${page}`;
}

export async function fetchAllPages<T>(
  url: string,
  querySeparator: string,
  init?: RequestInit,
  perPage = 100
): Promise<PaginatedResult<T>> {
  const items: T[] = [];
  let page = 1;
  let total: number | undefined;
  let totalPages: number | undefined;

  while (true) {
    const pageUrl = appendPageParams(url, querySeparator, page, perPage);
    const response = await fetch(pageUrl, init);

    if (!response.ok) {
      throw new Error(
        `Request failed: ${response.status} ${response.statusText} (${pageUrl})`
      );
    }

    const pageItems = (await response.json()) as T[];
    const totalHeader = response.headers.get("x-wp-total");
    const totalPagesHeader = response.headers.get("x-wp-totalpages");

    if (totalHeader) {
      total = Number(totalHeader);
    }
    if (totalPagesHeader) {
      totalPages = Number(totalPagesHeader);
    }

    items.push(...pageItems);

    if (totalPages && page >= totalPages) {
      break;
    }
    if (!totalPages && pageItems.length < perPage) {
      break;
    }

    page += 1;
  }

  return { items, total, totalPages };
}
