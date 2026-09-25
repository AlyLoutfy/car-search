/** Turn a URL slug ("seat-leon-2020") into a display title ("Seat Leon 2020"). */
export function slugToTitle(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Pull the object literal assigned in an inline script (`window.state = {...};`) out of page HTML.
 *
 * The literal is followed by more script on the same line, so we can't just parse "to the end":
 * this walks the braces, skipping over string contents, to find where the object closes. Returns
 * undefined when the assignment is missing or doesn't parse — callers fall back to other data.
 */
export function extractAssignedJson(html: string, variable: string): unknown {
  const assignment = html.indexOf(`${variable} =`);
  if (assignment < 0) return undefined;
  const start = html.indexOf('{', assignment);
  if (start < 0) return undefined;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, index + 1));
        } catch {
          return undefined;
        }
      }
    }
  }
  return undefined;
}
