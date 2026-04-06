/**
 * Preprocesses raw HTML bill text from Congress.gov into clean text
 * suitable for LLM summarization.
 *
 * Congress.gov "Formatted Text" is typically <pre>-wrapped plain text
 * with HTML entity encoding, not rich HTML.
 */

const MAX_CHARS = 20_000;

/**
 * Strip HTML tags, decode entities, normalize whitespace, and truncate
 * at a section boundary.
 */
export function preprocessBillText(html: string): string {
  let text = html;

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Remove GPO header lines (e.g., "[Congressional Bills 119th Congress]")
  text = text.replace(/^\[.*?\]\s*$/gm, "");

  // Remove decorative separator lines (underscores, dashes)
  text = text.replace(/^[_\-=]{10,}\s*$/gm, "");

  // Remove attestation/clerk lines at the end
  text = text.replace(/Attest:[\s\S]*$/m, "");

  // Collapse multiple blank lines into one
  text = text.replace(/\n{3,}/g, "\n\n");

  // Trim leading/trailing whitespace
  text = text.trim();

  // Smart truncation: cut at a section boundary (SEC. or TITLE) near the limit
  if (text.length > MAX_CHARS) {
    const truncated = text.slice(0, MAX_CHARS);
    // Find the last section heading before the cutoff
    const lastSection = truncated.lastIndexOf("\nSEC.");
    const lastTitle = truncated.lastIndexOf("\nTITLE");
    const cutPoint = Math.max(lastSection, lastTitle);

    if (cutPoint > MAX_CHARS * 0.5) {
      // Cut at the section boundary if it's in the latter half
      text = truncated.slice(0, cutPoint).trim();
    } else {
      // Otherwise cut at the last paragraph break
      const lastParagraph = truncated.lastIndexOf("\n\n");
      text =
        lastParagraph > MAX_CHARS * 0.8
          ? truncated.slice(0, lastParagraph).trim()
          : truncated.trim();
    }

    text += "\n\n[Text truncated — bill continues beyond this point]";
  }

  return text;
}
