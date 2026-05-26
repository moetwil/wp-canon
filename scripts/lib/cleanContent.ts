export function cleanContent(html: string): string {
  return html
    .replace(/<!--\s*\/?wp:[\s\S]*?-->/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
