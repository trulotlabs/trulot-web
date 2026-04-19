import { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data, error } = await supabase
    .from("parcel_page_api_v2")
    .select("apn_norm")
    .limit(25000);

  if (error || !data) return [];

  const baseUrl = "https://trulot-web.vercel.app";

  return data.map((parcel) => ({
    url: `${baseUrl}/parcel/${parcel.apn_norm}/${parcel.apn_norm}`,
    lastModified: new Date(),
  }));
}