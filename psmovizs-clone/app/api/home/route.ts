import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

const SITES: Record<string, string> = {
  moviesda: "https://moviesda18.com",
  isaidub: "https://isaidub.love",
};

export async function GET(req: NextRequest) {
  const site = req.nextUrl.searchParams.get("site") || "moviesda";
  const baseUrl = SITES[site] || SITES.moviesda;

  try {
    const res = await fetch(baseUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      next: { revalidate: 3600 },
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    const categories: { name: string; url: string }[] = [];

    // Try multiple selectors for category links
    $("a").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      if (!text || text.length < 3) return;
      
      // Filter for category-like links
      const isCategory =
        href.match(/\/(tamil|hindi|dubbed|movies|collection|series|web)/i) &&
        !href.match(/\.(jpg|png|gif|mp4|zip|rar)/i) &&
        href !== "/" &&
        href !== baseUrl;

      if (isCategory) {
        const url = href.startsWith("http")
          ? href.replace(baseUrl, "")
          : href;
        
        // Avoid duplicates
        if (!categories.find((c) => c.url === url) && url.startsWith("/")) {
          categories.push({ name: text, url });
        }
      }
    });

    // If no categories found via scraping, use known ones
    if (categories.length === 0) {
      if (site === "moviesda") {
        return NextResponse.json({
          categories: [
            { name: "Tamil 2026 Movies", url: "/tamil-2026-movies/" },
            { name: "Tamil 2025 Movies", url: "/tamil-2025-movies/" },
            { name: "Tamil 2024 Movies", url: "/tamil-2024-movies/" },
            { name: "Tamil 2023 Movies", url: "/tamil-2023-movies/" },
            { name: "Tamil 2022 Movies", url: "/tamil-2022-movies/" },
            { name: "Tamil 2021 Movies", url: "/tamil-2021-movies/" },
            { name: "Tamil 2020 Movies", url: "/tamil-2020-movies/" },
            { name: "Tamil 2019 Movies", url: "/tamil-2019-movies/" },
            { name: "Tamil 2018 Movies", url: "/tamil-2018-movies/" },
            { name: "Tamil 2017 Movies", url: "/tamil-2017-movies/" },
            { name: "Tamil Movies Collection", url: "/tamil-movies-collection/" },
            { name: "Tamil Single Parts Movies", url: "/moviesda-tamil-collections/" },
            { name: "Tamil HD Mobile Movies", url: "/tamil-hd-movies/" },
            { name: "Tamil A to Z Movies", url: "/tamil-atoz-movies/" },
            { name: "Latest Tamil Web Series", url: "/tamil-web-series-download/" },
            { name: "Tamil Dubbed Movies", url: "/tamil-dubbed-movies/" },
            { name: "Daily Updated Tamil Movies", url: "/tamilrockers-movies/" },
          ],
        });
      } else {
        return NextResponse.json({
          categories: [
            { name: "Tamil A-Z Dubbed Movies", url: "/tamil-atoz-dubbed-movies/" },
            { name: "Tamil 2026 Dubbed Movies", url: "/tamil-2026-dubbed-movies/" },
            { name: "Tamil 2025 Dubbed Movies", url: "/tamil-2025-dubbed-movies/" },
            { name: "Tamil 2024 Dubbed Movies", url: "/tamil-2024-dubbed-movies/" },
            { name: "Tamil 2023 Dubbed Movies", url: "/tamil-2023-dubbed-movies/" },
            { name: "Tamil 2022 Dubbed Movies", url: "/tamil-2022-dubbed-movies/" },
            { name: "Tamil 2021 Dubbed Movies", url: "/tamil-2021-dubbed-movies/" },
            { name: "Tamil 2020 Dubbed Movies", url: "/tamil-2020-dubbed-movies/" },
            { name: "Tamil 2019 Dubbed Movies", url: "/tamil-2019-dubbed-movies/" },
            { name: "Tamil 2018 Dubbed Movies", url: "/tamil-2018-dubbed-movies/" },
            { name: "Tamil Yearly Dubbed Movies", url: "/tamil-yearly-dubbed-movies/" },
            { name: "Tamil Dubbed Collections", url: "/movie/tamil-dubbed-movies-collections/" },
            { name: "Tamil Genres Dubbed Movies", url: "/tamil-genres-dubbed-movies/" },
            { name: "Tamil HD Dubbed Movies", url: "/movie/tamil-dubbed-movies-download/" },
            { name: "Tamil Dubbed Web Series", url: "/tamil-dubbed-web-series/" },
            { name: "Hollywood Movies in (English)", url: "/movie/hollywood-movies-in-english/" },
          ],
        });
      }
    }

    return NextResponse.json({ categories });
  } catch (err) {
    console.error("Home scrape error:", err);
    return NextResponse.json({ categories: [] });
  }
}
