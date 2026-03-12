import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data } = await supabase
    .from("parcel_page_api_v1")
    .select("apn_norm")
    .limit(1000);

  const baseUrl = "https://trulot-web.vercel.app";

  const urls = data
    ?.map(
      (p) =>
        `<url><loc>${baseUrl}/parcel/${p.apn_norm}/${p.apn_norm}</loc></url>`
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
    },
  });
}