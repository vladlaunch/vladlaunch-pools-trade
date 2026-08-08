import type { MetadataRoute } from "next";

/**
 * /admin already carries `robots: { index: false }` in its own metadata, but a meta tag
 * only helps a crawler that has already fetched the page. Disallowing it here keeps the
 * treasury view out of the crawl in the first place.
 *
 * /api is excluded for the same reason: those routes return JSON that means nothing in a
 * search result and would only dilute what does.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] }],
    sitemap: "https://vladlaunch.fun/sitemap.xml",
    host: "https://vladlaunch.fun",
  };
}
