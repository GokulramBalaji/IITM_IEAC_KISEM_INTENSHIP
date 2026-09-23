/**
 * Supabase REST API Seeding Script
 * Uses HTTP-based Admin API - no direct PostgreSQL connection needed.
 * Run: node seed_supabase.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

// Load environment variables from .env file if it exists
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
} catch (err) {}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

// Load default seed passwords securely from environment
const DEFAULT_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || 'ChangeMeOnFirstLogin@123';
const USER_PASSWORDS = {};

const USER_UUID_MAP = {
  'Dk0II5a6': 'd00d2026-c15b-4ef4-81f6-f4e56d315690',
  'C15PGHGg': 'd00d2026-c15b-4ef4-81f6-f4e56d315691',
  'QnBaB_lG': 'd00d2026-c15b-4ef4-81f6-f4e56d315692',
  'r3djUira': 'd00d2026-c15b-4ef4-81f6-f4e56d315693',
  'l0Or1i2d': 'd00d2026-c15b-4ef4-81f6-f4e56d315694'
};

const dbData = JSON.parse(fs.readFileSync(path.join(__dirname, 'frontend/src/data.json'), 'utf8'));

// Generic REST fetch helper
async function fetchRest(method, endpoint, body, useServiceKey = true) {
  const key = useServiceKey ? SERVICE_KEY : ANON_KEY;
  const url = SUPABASE_URL + endpoint;
  const bodyStr = body ? JSON.stringify(body) : null;

  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const opts = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Prefer': 'resolution=ignore-duplicates,return=minimal'
      }
    };
    if (bodyStr) opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// Insert rows via REST API
async function upsert(table, rows) {
  if (!rows || rows.length === 0) return;
  const res = await fetchRest('POST', `/rest/v1/${table}`, rows);
  if (res.status >= 400) {
    console.error(`  ✗ Failed to upsert ${table}:`, JSON.stringify(res.body).substring(0, 200));
  } else {
    console.log(`  ✓ Upserted ${rows.length} record(s) into ${table}`);
  }
}

async function main() {
  console.log('\n=== Supabase REST API Database Seeder ===\n');

  // ---- STEP 1: Create Auth Users ----
  console.log('→ Step 1: Creating auth users...');
  for (const u of dbData.users || []) {
    const uuid = USER_UUID_MAP[u.id];
    const finalEmail = u.email.includes('@') ? u.email : `${u.email}@iitm.com`;
    const password = USER_PASSWORDS[u.id] || DEFAULT_PASSWORD;

    const payload = {
      id: uuid,
      email: finalEmail,
      password,
      email_confirm: true,
      user_metadata: { name: u.name, role: u.role, phone: u.phone || '' }
    };

    const res = await fetchRest('POST', '/auth/v1/admin/users', payload);
    if (res.status === 200 || res.status === 201) {
      console.log(`  ✓ Created user: ${finalEmail} (${u.role})`);
    } else if (res.status === 422 && JSON.stringify(res.body).includes('already')) {
      console.log(`  ~ User already exists: ${finalEmail}`);
    } else {
      console.warn(`  ! Warning for ${finalEmail} [${res.status}]:`, JSON.stringify(res.body).substring(0, 120));
    }
    await new Promise(r => setTimeout(r, 300)); // rate limit buffer
  }

  // ---- STEP 2: Seed public.users ----
  console.log('\n→ Step 2: Seeding user profiles...');
  const userRows = (dbData.users || []).map(u => ({
    id: USER_UUID_MAP[u.id],
    name: u.name,
    email: u.email.includes('@') ? u.email : `${u.email}@iitm.com`,
    phone: u.phone || '',
    role: u.role.charAt(0).toUpperCase() + u.role.slice(1).toLowerCase() === 'Engineer' ? 'Engineer' :
          u.role.toLowerCase() === 'admin' ? 'Admin' :
          u.role.toLowerCase() === 'trainee' ? 'Trainee' : 'Engineer'
  }));
  await upsert('users', userRows);

  // ---- STEP 3: Seed utilities ----
  console.log('\n→ Step 3: Seeding utilities...');
  const utilRows = (dbData.utilities || []).map(u => ({ id: u.id, name: u.name }));
  if (utilRows.length > 0) await upsert('utilities', utilRows);
  else console.log('  ~ No utilities found');

  // ---- STEP 4: Seed vendors ----
  console.log('\n→ Step 4: Seeding vendors...');
  const vendorRows = (dbData.vendors || []).map(v => ({
    id: v.id,
    name: v.name || '',
    company_name: v.companyName || v.name || '',
    vendor_type: v.vendorType || 'General',
    status: v.status || 'Active',
    contact_person: v.contactPerson || null,
    mobile_number: v.mobileNumber || null,
    alternative_mobile_number: v.alternativeMobileNumber || null,
    email: v.email || null,
    website: v.website || null,
    street_address: v.streetAddress || null,
    city: v.city || null,
    state: v.state || null,
    country: v.country || null,
    pin_code: v.pinCode || null,
    gstin: v.gstin || null,
    pan: v.pan || null,
    business_reg_no: v.businessRegNo || null,
    remarks: v.remarks || null
  }));
  if (vendorRows.length > 0) await upsert('vendors', vendorRows);
  else console.log('  ~ No vendors found');

  // ---- STEP 5: Seed products ----
  console.log('\n→ Step 5: Seeding products...');
  const productRows = (dbData.products || []).map(p => ({
    id: p.id,
    vendor_id: p.vendorId,
    name: p.name || '',
    description: p.description || null,
    category: p.category || null,
    brand: p.brand || null,
    product_status: p.productStatus || 'Active',
    utility_name: p.utilityName || null
  }));
  if (productRows.length > 0) await upsert('products', productRows);
  else console.log('  ~ No products found');

  // ---- STEP 6: Seed inventory ----
  console.log('\n→ Step 6: Seeding inventory (instruments)...');
  const invRows = (dbData.instruments || []).map(i => ({
    id: i.id,
    status: i.status || 'available',
    location: i.location || 'warehouse',
    category: i.category || 'General',
    name: i.name || '',
    brand: i.brand || '',
    model: i.model || '',
    serial: i.serial || '',
    last_calibration_date: i.lastCalibrationDate || null,
    next_calibration_date: i.nextCalibrationDate || null,
    calibration_cycle_days: i.calibrationCycleDays || 365,
    calibration_certificate_url: i.calibrationCertificateUrl || null,
    product_images: i.productImages || [],
    product_overview: i.productOverview || null,
    specifications: i.specifications || null,
    parameters_measured: i.parametersMeasured || null,
    accuracy: i.accuracy || null,
    measurement_range: i.measurementRange || null,
    resolution: i.resolution || null,
    applications: i.applications || null,
    operating_procedure: i.operatingProcedure || null,
    calibration_procedure: i.calibrationProcedure || null,
    safety_instructions: i.safetyInstructions || null,
    user_manual_url: i.userManualUrl || null,
    youtube_url: i.youtubeUrl || null,
    booked_by: i.bookedBy ? (USER_UUID_MAP[i.bookedBy] || null) : null,
    next_available_date: i.nextAvailableDate || null
  }));
  if (invRows.length > 0) {
    // Insert in batches of 20
    for (let i = 0; i < invRows.length; i += 20) {
      await upsert('inventory', invRows.slice(i, i + 20));
    }
  } else {
    console.log('  ~ No instruments found');
  }

  // ---- STEP 7: Seed purchase orders ----
  console.log('\n→ Step 7: Seeding purchase orders (bookings)...');
  const bookingRows = (dbData.bookings || [])
    .filter(b => USER_UUID_MAP[b.userId])
    .map(b => ({
      id: b.id,
      user_id: USER_UUID_MAP[b.userId],
      instrument_id: b.instrumentId,
      start_date: b.startDate,
      due_date: b.dueDate,
      remarks: b.remarks || null,
      status: b.status || 'pending',
      returned_date: b.returnedDate || null,
      returned_by_name: b.returnedByName || null,
      return_remarks: b.returnRemarks || null,
      sheet_url: b.sheetUrl || null,
      bulk_group_id: b.bulkGroupId || null
    }));
  if (bookingRows.length > 0) await upsert('purchase_orders', bookingRows);
  else console.log('  ~ No bookings found');

  console.log('\n=== Seeding complete! ===\n');
  console.log('Default login credentials:');
  console.log('  Email:    admin@iitm.com   Password: VcydDPyQRH9@zU7  (Admin)');
  console.log('  Email:    gokulrambalaji@gmail.com   Password: gokulram@123');
  console.log('  Email:    iitmadmin@iit.com   Password: iitmadmin@123');
  console.log('  Email:    mathu@iit.com   Password: madhu@123\n');
  console.log('IMPORTANT: After seeding, update the admin password to your original');
  console.log('by going to Supabase Dashboard > Authentication > Users > admin@iitm.com\n');
}

main().catch(err => {
  console.error('\n✗ Fatal seeding error:', err.message);
  process.exit(1);
});
