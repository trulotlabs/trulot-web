import { supabase } from "@/lib/supabase";

export default async function ParcelPage({
  params,
}: {
  params: Promise<{ apn: string; slug: string }>;
}) {
  const { apn, slug } = await params;

  const { data, error } = await supabase
    .from("parcel_page_api_v1")
    .select("*")
    .eq("apn_norm", apn)
    .single();

  if (error || !data) {
    return (
      <main style={{ padding: "40px", fontFamily: "sans-serif" }}>
        <h1>Parcel not found</h1>
        <p>APN: {apn}</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "40px", fontFamily: "sans-serif", maxWidth: "900px", margin: "0 auto" }}>
      <h1>{data.page_title}</h1>

      <p>{data.meta_description}</p>

      <hr style={{ margin: "24px 0" }} />

      <h2>Parcel Details</h2>

      <p><strong>APN:</strong> {apn}</p>
      <p><strong>Zoning:</strong> {data.zone_name}</p>
      <p><strong>Lot Size:</strong> {Math.round(data.lot_area_sqft).toLocaleString()} SF</p>

      <hr style={{ margin: "24px 0" }} />

      <h2>Nearby Development Activity</h2>

      <p><strong>Projects analyzed nearby:</strong> {data.nearby_project_count}</p>
      <p><strong>Median units built:</strong> {data.median_units_built_nearby}</p>
      <p><strong>Largest nearby project:</strong> {data.max_units_built_nearby}</p>

      <p style={{ marginTop: "30px", color: "#777" }}>
        Current slug: {slug}
      </p>
    </main>
  );
}