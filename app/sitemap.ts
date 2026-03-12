import { supabase } from "@/lib/supabase";

export default async function sitemap() {
  const { data } = await supabase
    .from("parcel_page_api_v1")
    .select("apn_norm")
    .limit(1000);

  if (!data) return [];

  const baseUrl = "http://localhost:3000";

  return data.map((parcel) => ({
    url: `${baseUrl}/parcel/${parcel.apn_norm}/${parcel.apn_norm}`,
    lastModified: new Date(),
  }));
}