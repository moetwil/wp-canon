import { mkdir, readFile, writeFile } from "fs/promises";
import { loadPageSignals } from "./lib/quick-wins/pages";
import { renderReport } from "./lib/quick-wins/render";
import type { ContentIndex } from "./lib/quick-wins/types";

const OUTPUT_PATH = "reports/quick-wins.md";

async function main() {
  const index = JSON.parse(
    await readFile("data/content-index.json", "utf8")
  ) as ContentIndex;
  const pages = await Promise.all((index.items ?? []).map(loadPageSignals));

  await mkdir("reports", { recursive: true });
  await writeFile(OUTPUT_PATH, renderReport(pages));

  console.log(`Saved ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
