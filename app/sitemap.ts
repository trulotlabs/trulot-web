import type { MetadataRoute } from "next";
import { activeParcelSitemapEntries } from "@/lib/parcel-sitemap";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://trulot.com",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    ...activeParcelSitemapEntries(),
  ];
}
