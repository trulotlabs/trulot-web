import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 3) {
    return NextResponse.json({ results: [] });
  }

  // Search by address (ILIKE) — also try APN if query looks numeric
  const isApn = /^[\d\-]+$/.test(q);
  const apnNorm = q.replace(/-/g, '');

  let query = supabase
    .from('parcel_page_api_v2')
    .select('apn_norm, address, city, state, zone_name, slug')
    .limit(10);

  if (isApn && apnNorm.length >= 6) {
    query = query.ilike('apn_norm', `${apnNorm}%`);
  } else {
    query = query.ilike('address', `%${q}%`);
  }

  const { data: parcels, error } = await query;
  if (error || !parcels?.length) return NextResponse.json({ results: [] });

  // Fetch momentum labels for the matched APNs
  const apns = parcels.map((p) => p.apn_norm);
  const { data: projects } = await supabase
    .from('parcel_primary_project_v1')
    .select('apn_norm, project_momentum_label, has_building_project')
    .in('apn_norm', apns);

  const projectMap = Object.fromEntries((projects || []).map((p) => [p.apn_norm, p]));

  const results = parcels.map((p) => ({
    apn_norm: p.apn_norm,
    address: p.address,
    city: p.city,
    state: p.state,
    zone_name: p.zone_name,
    slug: p.slug,
    momentum: projectMap[p.apn_norm]?.project_momentum_label ?? null,
    has_building_project: projectMap[p.apn_norm]?.has_building_project ?? false,
  }));

  return NextResponse.json({ results });
}
