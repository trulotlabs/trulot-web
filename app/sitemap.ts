import { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";
import { canonicalParcelPath } from "@/lib/parcel-slug";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const home: MetadataRoute.Sitemap[number] = {
    url: "https://trulot.com",
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 1,
  };

  const { data, error } = await supabase
    .from("parcel_page_api_v2")
    .select("apn_norm,address")
    .limit(25000);

  if (error || !data) return [home];

  const baseUrl = "https://trulot.com";

  return [
    home,
    ...data.map((parcel) => ({
      url: `${baseUrl}${canonicalParcelPath(parcel.apn_norm, parcel.address)}`,
    })),
  ];
}
