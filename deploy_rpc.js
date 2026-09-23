/**
 * Deploys the search_vendors RPC to Supabase using the Management API.
 * Run: node deploy_rpc.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

// Load .env
try {
  const envPaths = [path.join(__dirname, '.env'), path.join(__dirname, '..', '.env')];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
        const part = line.trim();
        if (part && !part.startsWith('#')) {
          const idx = part.indexOf('=');
          if (idx > 0) {
            const k = part.substring(0, idx).trim();
            let v = part.substring(idx + 1).trim();
            if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
            else if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
            if (!process.env[k]) process.env[k] = v;
          }
        }
      });
    }
  }
} catch (_) {}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cxojeukkobhkrrrcwmoe.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY || '';

const sql = `
CREATE OR REPLACE FUNCTION public.search_vendors(
  search_query TEXT,
  utility_filter TEXT,
  vendor_filter TEXT,
  product_filter TEXT,
  page_num INT,
  page_size INT,
  sort_by TEXT,
  sort_order TEXT
)
RETURNS TABLE (
  id TEXT,
  name TEXT,
  company_name TEXT,
  vendor_type TEXT,
  status TEXT,
  contact_person TEXT,
  mobile_number TEXT,
  alternative_mobile_number TEXT,
  email TEXT,
  website TEXT,
  street_address TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  pin_code TEXT,
  gstin TEXT,
  pan TEXT,
  business_reg_no TEXT,
  remarks TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  product_count INT,
  total_count INT
) AS $$
DECLARE
  offset_val INT;
BEGIN
  offset_val := (page_num - 1) * page_size;
  
  RETURN QUERY
  WITH filtered_vendors AS (
    SELECT DISTINCT v.*
    FROM public.vendors v
    LEFT JOIN public.products p ON p.vendor_id = v.id
    WHERE 
      (vendor_filter = '' OR v.id = vendor_filter) AND
      (utility_filter = '' OR LOWER(p.utility_name) = LOWER(utility_filter)) AND
      (product_filter = '' OR p.id = product_filter OR p.name ILIKE '%' || product_filter || '%') AND
      (search_query = '' OR 
        v.name ILIKE '%' || search_query || '%' OR 
        v.company_name ILIKE '%' || search_query || '%' OR 
        v.contact_person ILIKE '%' || search_query || '%' OR
        p.name ILIKE '%' || search_query || '%' OR
        p.category ILIKE '%' || search_query || '%' OR
        p.utility_name ILIKE '%' || search_query || '%'
      )
  ),
  total_cnt AS (
    SELECT COUNT(*)::INT AS cnt FROM filtered_vendors
  )
  SELECT 
    fv.id, fv.name, fv.company_name, fv.vendor_type, fv.status, fv.contact_person,
    fv.mobile_number, fv.alternative_mobile_number, fv.email, fv.website,
    fv.street_address, fv.city, fv.state, fv.country, fv.pin_code, fv.gstin, fv.pan,
    fv.business_reg_no, fv.remarks, fv.created_at,
    (SELECT COUNT(*)::INT FROM public.products pr WHERE pr.vendor_id = fv.id) AS product_count,
    tc.cnt AS total_count
  FROM filtered_vendors fv
  CROSS JOIN total_cnt tc
  ORDER BY 
    CASE WHEN sort_by = 'name' AND sort_order = 'asc' THEN fv.name END ASC,
    CASE WHEN sort_by = 'name' AND sort_order = 'desc' THEN fv.name END DESC,
    CASE WHEN sort_by = 'company_name' AND sort_order = 'asc' THEN fv.company_name END ASC,
    CASE WHEN sort_by = 'company_name' AND sort_order = 'desc' THEN fv.company_name END DESC
  LIMIT page_size
  OFFSET offset_val;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.search_vendors TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_vendors TO anon;
`;

function httpPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const bodyStr = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

async function main() {
  console.log('Deploying search_vendors RPC to Supabase...');
  console.log('URL:', SUPABASE_URL);
  
  if (!SERVICE_KEY) {
    console.error('ERROR: SUPABASE_SECRET_KEY is not set!');
    process.exit(1);
  }

  const res = await httpPost(
    `${SUPABASE_URL}/rest/v1/rpc/exec_sql`,
    {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`
    },
    { sql }
  );

  if (res.status >= 400) {
    console.log('RPC method failed, trying direct SQL via query endpoint...');
    // The exec_sql function may not exist, try the SQL editor API
    const res2 = await httpPost(
      `${SUPABASE_URL}/rest/v1/`,
      {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Profile': 'pg_catalog'
      },
      { query: sql }
    );
    console.log('Response:', res2.status, JSON.stringify(res2.body).substring(0, 300));
  } else {
    console.log('✓ search_vendors RPC deployed successfully!');
    console.log('Response:', res.status);
  }
}

main().catch(console.error);
