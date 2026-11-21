// My parser: it turns the raw mediastack response into MY OWN clean data model.
//
// Why I do this: the API's data is messy (empty strings, nulls, odd dates,
// tracking junk in URLs). I clean it ONCE here, so the rest of my code
// (and my database) only ever sees nice, predictable objects.
//
// My clean Article model looks like this:
// {
//   url:         string          (required, cleaned – this is my unique key)
//   title:       string          (required)
//   description: string | null
//   author:      string | null
//   source:      string | null
//   imageUrl:    string | null
//   category:    string | null   (lowercase, e.g. "technology")
//   language:    string | null   (2 letters, lowercase, e.g. "en")
//   country:     string | null   (2 letters, lowercase, e.g. "us")
//   publishedAt: Date   | null
// }

// I trim text and turn empty strings into null, so "no value" is always null.
function cleanText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed === '' ? null : trimmed;
}

// I lowercase short codes like "EN" -> "en", and reject anything that isn't 2 letters.
function cleanCode(value) {
  const text = cleanText(value);
  if (!text) return null;
  const lower = text.toLowerCase();
  return /^[a-z]{2}$/.test(lower) ? lower : null;
}

// I turn the date text into a real Date. If it's not a valid date, I use null.
function cleanDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Tracking parameters that I strip from URLs. Without this, the SAME article
// could appear twice in my database with different ?utm_source=... values.
const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i;

// I clean a URL so the same article always gets the same URL.
// Returns null if it's not a valid http(s) URL.
export function normalizeUrl(value) {
  const text = cleanText(value);
  if (!text) return null;

  let url;
  try {
    url = new URL(text);
  } catch {
    return null; // not a valid URL at all
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  url.hash = ''; // "#comments" etc. is the same page
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  }
  return url.toString(); // URL() already lowercases the host for me
}

// I parse ONE raw article. Returns null if it's unusable (no url or no title).
export function parseArticle(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const url = normalizeUrl(raw.url);
  const title = cleanText(raw.title);
  if (!url || !title) return null;

  return {
    url,
    title,
    description: cleanText(raw.description),
    author: cleanText(raw.author),
    source: cleanText(raw.source),
    imageUrl: normalizeUrl(raw.image),
    category: cleanText(raw.category)?.toLowerCase() ?? null,
    language: cleanCode(raw.language),
    country: cleanCode(raw.country),
    publishedAt: cleanDate(raw.published_at),
  };
}

// I parse a WHOLE API response.
// I also remove duplicates inside the same response (it happens!),
// and I count how many articles I had to skip, so I can log it.
export function parseNewsResponse(response) {
  const rawArticles = Array.isArray(response?.data) ? response.data : [];
  const byUrl = new Map();
  let skipped = 0;

  for (const raw of rawArticles) {
    const article = parseArticle(raw);
    if (!article) {
      skipped++;
      continue;
    }
    byUrl.set(article.url, article); // same URL twice -> the last one wins
  }

  return {
    articles: [...byUrl.values()],
    skipped,
    total: Number(response?.pagination?.total ?? 0),
  };
}
