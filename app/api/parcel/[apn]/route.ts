import { normalizeApn, getParcelPageData } from "../../../../lib/get-parcel-page-data";

export async function GET(_req: Request, { params }: { params: Promise<{ apn: string }> }) {
  const { apn: rawApn } = await params;
  const apn = normalizeApn(rawApn);

  const data = await getParcelPageData(rawApn);
  if (!data) {
    return Response.json({ error: "Parcel not found", apn }, { status: 404 });
  }

  return Response.json(data);
}
