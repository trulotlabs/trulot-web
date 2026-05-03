// Supabase Edge Function: nearby-parcels
// Returns nearby active/completed parcels using PostGIS spatial queries

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NearbyParcel {
  apn: string;
  address: string;
  project_state: string | null;
  distance_ft: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const apn = url.searchParams.get('apn');
    const radiusFt = parseInt(url.searchParams.get('radius_ft') || '2640'); // Default: half mile

    // Validate required params
    if (!apn) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: apn' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role key (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error: missing Supabase credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Convert radius from feet to meters (PostGIS uses meters)
    const radiusMeters = radiusFt * 0.3048;

    // Query for nearby parcels using PostGIS
    // This uses ST_DWithin to find parcels within the specified radius
    // Note: The table and column names may need adjustment based on actual schema
    const { data: nearbyParcels, error: queryError } = await supabase.rpc(
      'get_nearby_parcels',
      {
        subject_apn: apn,
        radius_meters: radiusMeters,
      }
    );

    // If RPC doesn't exist, fall back to direct query
    if (queryError && queryError.message?.includes('does not exist')) {
      console.log('RPC not found, attempting direct query');

      // Direct SQL query as fallback
      // First get the subject parcel geometry
      const { data: subjectParcel, error: subjectError } = await supabase
        .from('parcels_spatial')
        .select('geom, apn_norm')
        .eq('apn_norm', apn)
        .single();

      if (subjectError || !subjectParcel) {
        // Try alternative table name
        const { data: altParcel, error: altError } = await supabase
          .from('parcel_page_api_v2')
          .select('apn_norm')
          .eq('apn_norm', apn)
          .single();

        if (altError || !altParcel) {
          return new Response(
            JSON.stringify({ error: 'Parcel not found', apn }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // If parcel exists but no spatial data, return empty results with explanation
        return new Response(
          JSON.stringify({
            apn,
            radius_ft: radiusFt,
            nearby_parcels: [],
            error: 'PostGIS spatial queries not available - geometry column not found. Please use the RPC function or ensure spatial tables exist.',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // If we have geometry, query for nearby parcels
      // This would require raw SQL which we can't do safely here
      return new Response(
        JSON.stringify({
          apn,
          radius_ft: radiusFt,
          nearby_parcels: [],
          error: 'Please create the get_nearby_parcels RPC function in Supabase. See deployment instructions.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (queryError) {
      console.error('Query error:', queryError);
      return new Response(
        JSON.stringify({ error: 'Database query failed', details: queryError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format and return results
    const results: NearbyParcel[] = (nearbyParcels || []).map((p: any) => ({
      apn: p.apn_norm,
      address: p.address,
      project_state: p.project_state || null,
      distance_ft: Math.round(p.distance_ft),
    }));

    return new Response(
      JSON.stringify({
        apn,
        radius_ft: radiusFt,
        nearby_parcels: results,
        count: results.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
