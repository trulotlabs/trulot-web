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

  const { data: permitData } = await supabase
  .from("parcel_permit_terminal_v2")
  .select("*")
  .eq("apn_norm", apn)
  .order("opened_date", { ascending: false });
  
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

      <hr style={{ margin: "32px 0" }} />

<h2>Permit Activity</h2>

{permitData && permitData.length > 0 ? (
  <div>
    {permitData.map((permit: any, index: number) => (
      <div
        key={index}
        style={{
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "16px",
          background: "#fafafa"
        }}
      >
        <p><strong>Project ID:</strong> {permit.project_id || "—"}</p>
        <p><strong>Job ID:</strong> {permit.job_id || "—"}</p>
        <p><strong>Permit:</strong> {permit.record_number || "—"}</p>
        <p><strong>Type:</strong> {permit.record_type || "—"}</p>
        <p><strong>Status:</strong> {permit.status || "—"}</p>
        <p><strong>Stage:</strong> {permit.normalized_stage || "—"}</p>
        <p><strong>Opened:</strong> {permit.opened_date || "—"}</p>
        <p><strong>Last Activity:</strong> {permit.last_activity_date || "—"}</p>

        {permit.description && (
          <p style={{ marginTop: "10px" }}>
            <strong>Scope:</strong> {permit.description}
          </p>
        )}
      </div>
    ))}
  </div>
) : (
  <p>No permit activity currently surfaced for this parcel.</p>
)}
    </main>
  );
}
