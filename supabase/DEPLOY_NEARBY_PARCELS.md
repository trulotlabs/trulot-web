# Deploy Nearby Parcels Edge Function

This guide walks through deploying the PostGIS-powered nearby parcels edge function.

## Prerequisites

- Supabase project with PostGIS extension enabled
- Admin access to Supabase Dashboard
- A spatial table with parcel geometries (or ability to add geometry columns)

## Part 1: Enable PostGIS (if not already enabled)

1. Go to Supabase Dashboard → Database → Extensions
2. Search for "postgis"
3. Click "Enable" if not already enabled
4. Wait for extension to activate

## Part 2: Create the Database Function

The edge function calls a database RPC function to perform the spatial query. You need to create this function first.

### Option A: If you have a `parcels` table with a `geom` column

Run this SQL in the SQL Editor (Dashboard → SQL Editor → New query):

```sql
CREATE OR REPLACE FUNCTION get_nearby_parcels(
  subject_apn TEXT,
  radius_meters NUMERIC
)
RETURNS TABLE (
  apn_norm TEXT,
  address TEXT,
  project_state TEXT,
  distance_ft NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p2.apn_norm,
    p2.address,
    pp.project_momentum_label AS project_state,
    ST_Distance(p1.geom::geography, p2.geom::geography) * 3.28084 AS distance_ft
  FROM parcels p1
  JOIN parcels p2 ON p1.apn_norm != p2.apn_norm
  LEFT JOIN parcel_primary_project_v1 pp ON p2.apn_norm = pp.apn_norm
  WHERE p1.apn_norm = subject_apn
    AND ST_DWithin(p1.geom::geography, p2.geom::geography, radius_meters)
    AND pp.project_momentum_label IN ('Active', 'Completed', 'Awaiting Issuance')
  ORDER BY distance_ft ASC
  LIMIT 20;
END;
$$ LANGUAGE plpgsql;
```

### Option B: If your spatial data is in a different table structure

Adjust the SQL above to match your actual table and column names:
- Replace `parcels` with your spatial table name
- Replace `geom` with your geometry column name
- Replace `apn_norm` with your parcel identifier column
- Adjust the join to `parcel_primary_project_v1` based on your schema

### Option C: If you don't have a geometry column yet

You'll need to add PostGIS geometry columns to your parcel table:

```sql
-- Add geometry column to existing table
ALTER TABLE parcel_page_api_v2 
ADD COLUMN geom geometry(Point, 4326);

-- Create spatial index
CREATE INDEX idx_parcels_geom ON parcel_page_api_v2 USING GIST(geom);

-- Populate geometries from lat/lon if you have them
UPDATE parcel_page_api_v2
SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE longitude IS NOT NULL AND latitude IS NOT NULL;
```

Then use the function from Option A, adjusting table names as needed.

## Part 3: Deploy the Edge Function

### Using Supabase CLI (Recommended)

1. Install Supabase CLI if not already installed:
   ```bash
   npm install -g supabase
   ```

2. Link to your project:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

3. Deploy the function:
   ```bash
   supabase functions deploy nearby-parcels
   ```

4. Set environment variables:
   ```bash
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   ```

### Using Supabase Dashboard (Manual)

1. Go to Supabase Dashboard → Edge Functions
2. Click "New Function"
3. Name it: `nearby-parcels`
4. Copy the contents of `supabase/functions/nearby-parcels/index.ts`
5. Paste into the editor
6. Click "Deploy"

7. Add environment variables:
   - Go to Edge Functions → nearby-parcels → Settings
   - Add variable: `SUPABASE_SERVICE_ROLE_KEY`
   - Value: Your service role key from Settings → API → service_role key (secret)
   - Note: `SUPABASE_URL` is auto-populated

## Part 4: Test the Function

Test using curl:

```bash
curl "https://YOUR_PROJECT_REF.supabase.co/functions/v1/nearby-parcels?apn=5570600100&radius_ft=2640"
```

Expected response:
```json
{
  "apn": "5570600100",
  "radius_ft": 2640,
  "nearby_parcels": [
    {
      "apn": "5570600200",
      "address": "123 Main St",
      "project_state": "Active",
      "distance_ft": 245
    }
  ],
  "count": 1
}
```

## Part 5: Update Frontend Environment Variables

Add to your `.env.local` (if calling from frontend):

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

The parcel page will automatically fetch from the edge function at:
`/functions/v1/nearby-parcels?apn={apn}&radius_ft=2640`

## Troubleshooting

### "RPC function does not exist"
- Make sure you ran the SQL from Part 2
- Verify the function exists: `SELECT * FROM pg_proc WHERE proname = 'get_nearby_parcels';`

### "PostGIS extension not found"
- Enable PostGIS in Database → Extensions
- May need to create extension manually: `CREATE EXTENSION postgis;`

### "Geometry column not found"
- Follow Option C in Part 2 to add geometry columns
- Ensure your parcels have lat/lon or geometry data

### "No results returned"
- Check that the `parcel_primary_project_v1` table exists and has data
- Verify that parcels within the radius actually have project states
- Try a larger radius: `radius_ft=5280` (1 mile)

### CORS errors
- The edge function includes CORS headers
- If issues persist, check browser console for specific errors

## Monitoring

View edge function logs:
- Supabase Dashboard → Edge Functions → nearby-parcels → Logs

Check execution time and error rates to monitor performance.

## Schema Requirements Summary

Required tables/views:
1. Spatial table with parcels (e.g., `parcels` or `parcel_page_api_v2`)
   - Columns: `apn_norm` (TEXT), `geom` (geometry), `address` (TEXT)
2. `parcel_primary_project_v1` view
   - Columns: `apn_norm` (TEXT), `project_momentum_label` (TEXT)

Required PostGIS functions:
- `ST_DWithin` - spatial distance query
- `ST_Distance` - distance calculation
- `ST_SetSRID`, `ST_MakePoint` - geometry creation (if populating from lat/lon)
