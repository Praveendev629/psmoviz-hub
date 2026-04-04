import { NextRequest, NextResponse } from "next/server";

const SITES: Record<string, string> = {
  moviesda: "https://moviesda18.com",
  isaidub: "https://isaidub.love",
};

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
};

async function fetchHtml(url: string, referer?: string): Promise<string> {
  const res = await fetch(url, {
    headers: { ...HEADERS, ...(referer ? { Referer: referer } : {}) },
    next: { revalidate: 600 },
  });
  return res.text();
}

function extractHrefLinks(
  html: string,
  pattern: RegExp
): { name: string; url: string }[] {
  const links: { name: string; url: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(html)) !== null) {
    const url = m[1];
    const name = (m[2] || "").replace(/<[^>]+>/g, "").trim();
    if (url && name && !links.find((l) => l.url === url)) {
      links.push({ name, url });
    }
  }
  return links;
}

/**
 * Moviesda download chain:
 * /download/slug/ → download.moviespage.xyz/download/file/ID → movies.downloadpage.xyz/download/page/ID → CDN links
 */
async function resolveMoviesdaChain(
  pageUrl: string,
  siteBase: string
): Promise<{
  serverLinks: { name: string; url: string }[];
  watchLinks: { name: string; url: string }[];
}> {
  const fullUrl = pageUrl.startsWith("http")
    ? pageUrl
    : `${siteBase}${pageUrl}`;
  const html1 = await fetchHtml(fullUrl, siteBase);

  // Step 1: find download.moviespage.xyz link
  const step1 = extractHrefLinks(
    html1,
    /href="(https?:\/\/download\.moviespage\.xyz\/download\/file\/\d+)"[^>]*>([^<]+)/gi
  );

  let html3 = "";

  if (step1.length > 0) {
    const html2 = await fetchHtml(step1[0].url, siteBase);
    // Step 2: find movies.downloadpage.xyz link
    const step2 = extractHrefLinks(
      html2,
      /href="(https?:\/\/movies\.downloadpage\.xyz\/download\/page\/\d+)"[^>]*>([^<]+)/gi
    );
    if (step2.length > 0) {
      html3 = await fetchHtml(step2[0].url, step1[0].url);
    } else {
      html3 = html2;
    }
  } else {
    html3 = html1;
  }

  // Extract CDN download links
  const dlLinks = extractHrefLinks(
    html3,
    /href="(https?:\/\/cdn\.[^"]+|https?:\/\/s\d+\.[^"]+\.(?:mp4|mkv)[^"]*)"[^>]*>([^<]+)/gi
  );

  // Extract watch links
  const watchLinks = extractHrefLinks(
    html3,
    /href="(https?:\/\/play\.[^"]+|https?:\/\/[^"]*stream[^"]+)"[^>]*>(Watch[^<]+)/gi
  );

  // Fallback: grab all "Download Server X" / "Watch Online X" links
  if (dlLinks.length === 0) {
    const allLinks = extractHrefLinks(
      html3,
      /href="(https?:\/\/[^"#]+)"[^>]*>\s*((?:Download|Watch)[^<]+)/gi
    );
    const dl = allLinks.filter((l) => l.name.toLowerCase().includes("download"));
    const wl = allLinks.filter((l) => l.name.toLowerCase().includes("watch"));
    return { serverLinks: dl, watchLinks: wl };
  }

  return { serverLinks: dlLinks, watchLinks };
}

/**
 * Isaidub download chain:
 * /download/page/ID/ → dubpage.xyz/download/view/ID → dubmv.top/download/file/ID → CDN links
 */
async function resolveIsaidubChain(
  pageUrl: string,
  siteBase: string
): Promise<{
  serverLinks: { name: string; url: string }[];
  watchLinks: { name: string; url: string }[];
}> {
  const fullUrl = pageUrl.startsWith("http")
    ? pageUrl
    : `${siteBase}${pageUrl}`;
  const html1 = await fetchHtml(fullUrl, siteBase);

  // Step 1: dubpage.xyz
  const step1 = extractHrefLinks(
    html1,
    /href="(https?:\/\/dubpage\.xyz\/download\/view\/\d+)"[^>]*>([^<]+)/gi
  );

  let html3 = "";
  if (step1.length > 0) {
    const html2 = await fetchHtml(step1[0].url, siteBase);
    // Step 2: dubmv.top
    const step2 = extractHrefLinks(
      html2,
      /href="(https?:\/\/dubmv\.top\/download\/file\/\d+)"[^>]*>([^<]+)/gi
    );
    if (step2.length > 0) {
      html3 = await fetchHtml(step2[0].url, step1[0].url);
    } else {
      html3 = html2;
    }
  } else {
    html3 = html1;
  }

  // Extract CDN download links (dubshare)
  const dlLinks = extractHrefLinks(
    html3,
    /href="(https?:\/\/s\d+\.dubshare\.[^"]+)"[^>]*>(Download[^<]+)/gi
  );

  const watchLinks = extractHrefLinks(
    html3,
    /href="(https?:\/\/dub\.[^"]+stream[^"]+|https?:\/\/[^"]*stream[^"]+)"[^>]*>(Watch[^<]+)/gi
  );

  if (dlLinks.length === 0) {
    const allLinks = extractHrefLinks(
      html3,
      /href="(https?:\/\/[^"#]+)"[^>]*>\s*((?:Download|Watch)[^<]+)/gi
    );
    const dl = allLinks.filter((l) => l.name.toLowerCase().includes("download"));
    const wl = allLinks.filter((l) => l.name.toLowerCase().includes("watch"));
    return { serverLinks: dl, watchLinks: wl };
  }

  return { serverLinks: dlLinks, watchLinks };
}

/**
 * Extract sub-navigation items from a movie detail page.
 * Returns quality groups, quality options, or file list items.
 * Strictly filters out A-Z nav links and site navigation.
 */
function extractSubItems(
  html: string,
  pageUrl: string
): { name: string; url: string }[] {
  const items: { name: string; url: string }[] = [];

  // Remove noisy blocks
  const cleanHtml = html
    .replace(/<div[^>]*class="[^"]*alpha-list[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<div[^>]*class="[^"]*Tag[^"]*"[^>]*>[\s\S]*?<\/div>/gi, "");

  // Method 1: .coral class links (these are the file/download item links on moviesda/isaidub)
  const coralRe =
    /<a[^>]+href="(\/[^"?#]+)"[^>]*class="coral"[^>]*>\s*(?:<strong>)?([^<]+)(?:<\/strong>)?\s*<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = coralRe.exec(cleanHtml)) !== null) {
    const href = m[1];
    const text = m[2].trim();
    if (!text || text.length < 2) continue;
    if (!items.find((i) => i.url === href)) items.push({ name: text, url: href });
  }

  if (items.length > 0) return items;

  // Method 2: internal links that are sub-pages (have movie/quality context)
  // Only pick links that are clearly sub-pages of the current movie
  // Current page: /kumbaari-2024-tamil-movie/
  // Sub-pages: /kumbaari-original-movie/, /kumbaari-720p-hd-movie/, /download/xxx/
  const allLinkRe =
    /<a[^>]+href="(\/[^"?#]+)"[^>]*>([^<]+)<\/a>/gi;

  // Skip links text patterns
  const skipTexts = new Set([
    "Home", "Contact Us", "DMCA", "Download Now", "Go to Home",
    "SMS", "Facebook", "Twitter", "Whatsapp", "Telegram Channel",
    "Facebook Fan Page", "Telegram Update Page",
    "A","B","C","D","E","F","G","H","I","J","K","L","M",
    "N","O","P","Q","R","S","T","U","V","W","X","Y","Z",
  ]);

  // Skip URL patterns
  const skipUrlRe =
    /^\/(?:tamil-\d{4}-movies|tamil-dubbed|tamilrockers|tamil-hd|tamil-web-series|tamil-movies-collection|moviesda-tamil|tamil-atoz|tamil-yearly|tamil-single|latest-updates|home\.php|movies\/[a-z]\/)[\/?]/;

  while ((m = allLinkRe.exec(cleanHtml)) !== null) {
    const href = m[1];
    const text = m[2].trim();

    if (!text || text.length < 2) continue;
    if (skipTexts.has(text)) continue;
    if (/^\d+$/.test(text) || /^»|«$/.test(text)) continue;
    if (skipUrlRe.test(href)) continue;
    if (href === pageUrl || href === "/") continue;

    if (!items.find((i) => i.url === href)) {
      items.push({ name: text, url: href });
    }
  }

  return items;
}

export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get("url") || "";
  const site = req.nextUrl.searchParams.get("site") || "moviesda";
  const siteBase = SITES[site] || SITES.moviesda;

  if (!urlParam)
    return NextResponse.json({ items: [], serverLinks: [], watchLinks: [] });

  try {
    // Detect if this is a download trigger page
    const isMoviesdaDownload =
      site === "moviesda" && /^\/download\//.test(urlParam);
    const isIsaidubDownload =
      site === "isaidub" && /^\/download\/page\//.test(urlParam);

    if (isMoviesdaDownload) {
      const result = await resolveMoviesdaChain(urlParam, siteBase);
      return NextResponse.json({ items: [], ...result });
    }

    if (isIsaidubDownload) {
      const result = await resolveIsaidubChain(urlParam, siteBase);
      return NextResponse.json({ items: [], ...result });
    }

    // Scrape the page for sub-items
    const fullUrl = urlParam.startsWith("http")
      ? urlParam
      : `${siteBase}${urlParam}`;
    const html = await fetchHtml(fullUrl, siteBase);

    const items = extractSubItems(html, urlParam);

    // If items contain download page links, auto-resolve them all
    const downloadItems = items.filter(
      (i) =>
        (site === "moviesda" && /^\/download\//.test(i.url)) ||
        (site === "isaidub" && /^\/download\/page\//.test(i.url))
    );

    if (downloadItems.length > 0) {
      const allServerLinks: { name: string; url: string }[] = [];
      const allWatchLinks: { name: string; url: string }[] = [];

      await Promise.all(
        downloadItems.map(async (item) => {
          try {
            let resolved: {
              serverLinks: { name: string; url: string }[];
              watchLinks: { name: string; url: string }[];
            };
            if (site === "moviesda") {
              resolved = await resolveMoviesdaChain(item.url, siteBase);
            } else {
              resolved = await resolveIsaidubChain(item.url, siteBase);
            }
            // Tag each link with the file name for clarity
            for (const l of resolved.serverLinks) {
              allServerLinks.push({
                name: `${item.name} — ${l.name}`,
                url: l.url,
              });
            }
            for (const l of resolved.watchLinks) {
              allWatchLinks.push({
                name: `${item.name} — ${l.name}`,
                url: l.url,
              });
            }
          } catch (e) {
            console.error("resolve error", e);
          }
        })
      );

      if (allServerLinks.length > 0 || allWatchLinks.length > 0) {
        return NextResponse.json({
          items: items.filter(
            (i) =>
              !(site === "moviesda" && /^\/download\//.test(i.url)) &&
              !(site === "isaidub" && /^\/download\/page\//.test(i.url))
          ),
          serverLinks: allServerLinks,
          watchLinks: allWatchLinks,
        });
      }
    }

    return NextResponse.json({ items, serverLinks: [], watchLinks: [] });
  } catch (err) {
    console.error("Details error:", err);
    return NextResponse.json({ items: [], serverLinks: [], watchLinks: [] });
  }
}
