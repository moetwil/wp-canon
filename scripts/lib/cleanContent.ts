function extractDivInnerHtml(html: string, id: string) {
  const openTagPattern = new RegExp(`<div\\b[^>]*\\bid=["']${id}["'][^>]*>`, "i");
  const match = html.match(openTagPattern);

  if (!match || match.index === undefined) {
    return html;
  }

  let depth = 1;
  let cursor = match.index + match[0].length;
  const tagPattern = /<\/?div\b[^>]*>/gi;
  tagPattern.lastIndex = cursor;

  while (depth > 0) {
    const tag = tagPattern.exec(html);

    if (!tag) {
      return html;
    }

    if (tag[0].startsWith("</")) {
      depth -= 1;
    } else {
      depth += 1;
    }

    if (depth === 0) {
      return html.slice(cursor, tag.index);
    }
  }

  return html;
}

export function cleanContent(html: string): string {
  return extractDivInnerHtml(html, "eckb-article-content-body")
    .replace(/<!--\s*\/?wp:[\s\S]*?-->/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
