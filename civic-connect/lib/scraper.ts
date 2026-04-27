/**
 * Web scraper for congressional representative websites
 */

export async function scrapeRepresentativeWebsite(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "CivicConnect/1.0 (Civic engagement platform)",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    
    // Extract text content (remove HTML tags)
    const text = extractTextFromHTML(html);
    
    return text;
  } catch (error) {
    console.error(`Scraping error for ${url}:`, error);
    return "";
  }
}

function extractTextFromHTML(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
  
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  
  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  
  // Clean up whitespace
  text = text.replace(/\s+/g, " ").trim();
  
  return text;
}

export async function scrapeAllRepresentatives(
  representatives: Array<{ id: string; websiteUrl: string | null }>
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  
  // Scrape in batches to avoid overwhelming servers
  const batchSize = 10;
  for (let i = 0; i < representatives.length; i += batchSize) {
    const batch = representatives.slice(i, i + batchSize);
    
    const promises = batch.map(async (rep) => {
      if (!rep.websiteUrl) return;
      
      const content = await scrapeRepresentativeWebsite(rep.websiteUrl);
      if (content) {
        results.set(rep.id, content);
      }
      
      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    });
    
    await Promise.all(promises);
  }
  
  return results;
}

// Congressional website patterns
export function getRepresentativeWebsiteUrl(
  chamber: string,
  state: string,
  lastName: string
): string {
  const lastNameLower = lastName.toLowerCase().replace(/[^a-z]/g, "");
  
  if (chamber === "house") {
    return `https://${lastNameLower}.house.gov`;
  } else {
    return `https://www.${lastNameLower}.senate.gov`;
  }
}
