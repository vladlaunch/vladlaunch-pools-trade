import type { MetadataRoute } from "next";

const BASE = "https://vladlaunch.fun";

/**
 * Only the fixed pages. Token pages are deliberately absent: there are tens of thousands
 * of them, most are worth nothing within a day, and listing them would spend the whole
 * crawl budget on dead curves instead of on the pages that explain the product.
 *
 * lastModified is omitted rather than stamped with the build time. A build date is not
 * evidence a page changed, and a sitemap that claims every page changed on every deploy
 * teaches a crawler to ignore the field.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${BASE}/board`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${BASE}/docs`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/create`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/claim`, changeFrequency: "monthly", priority: 0.4 },
  ];
}
