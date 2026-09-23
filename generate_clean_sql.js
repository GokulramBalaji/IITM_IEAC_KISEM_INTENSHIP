/**
 * Generates supabase_clean_setup.sql - a complete, clean, no-RLS, no-FK-issue
 * setup SQL with hardcoded real UUIDs from Supabase auth.
 */
const fs = require('fs');
const path = require('path');

const dbData = JSON.parse(fs.readFileSync(path.join(__dirname, 'frontend/src/data.json'), 'utf8'));

// Real UUIDs from Supabase auth (fetched via Admin API)
const USER_UUID_MAP = {
  'Dk0II5a6': 'd00d2026-c15b-4ef4-81f6-f4e56d315690', // admin@iitm.com
  'C15PGHGg': 'd00d2026-c15b-4ef4-81f6-f4e56d315691', // gokulrambalaji
  'QnBaB_lG': 'd00d2026-c15b-4ef4-81f6-f4e56d315692', // iitmadmin
  'r3djUira': 'd00d2026-c15b-4ef4-81f6-f4e56d315693', // Madhu
  'l0Or1i2d': 'd00d2026-c15b-4ef4-81f6-f4e56d315694'  // mathu
};

function q(v) {
  if (v === null || v === undefined || v === '') return 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
}
function qj(v) {
  if (!v || (Array.isArray(v) && v.length === 0)) return "'[]'::jsonb";
  return "'" + JSON.stringify(v).replace(/'/g, "''") + "'::jsonb";
}

const headerSQL = fs.readFileSync(path.join(__dirname, 'supabase_clean_setup.sql'), 'utf8');

let sql = headerSQL;

// Instruments
for (const i of dbData.instruments || []) {
  const bookedBy = i.bookedBy ? (USER_UUID_MAP[i.bookedBy] || null) : null;
  sql += `INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES (${q(i.id)},${q(i.status)},${q(i.location)},${q(i.category)},${q(i.name)},${q(i.brand)},${q(i.model)},${q(i.serial)},${i.lastCalibrationDate ? q(i.lastCalibrationDate) : 'NULL'},${i.nextCalibrationDate ? q(i.nextCalibrationDate) : 'NULL'},${i.calibrationCycleDays || 365},${q(i.calibrationCertificateUrl)},${qj(i.productImages)},${q(i.productOverview)},${q(i.specifications)},${q(i.parametersMeasured)},${q(i.accuracy)},${q(i.measurementRange)},${q(i.resolution)},${q(i.applications)},${q(i.operatingProcedure)},${q(i.calibrationProcedure)},${q(i.safetyInstructions)},${q(i.userManualUrl)},${q(i.youtubeUrl)},${bookedBy ? q(bookedBy) : 'NULL'},${i.nextAvailableDate ? q(i.nextAvailableDate) : 'NULL'}) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;\n`;
}

sql += `\n-- ============================================================\n-- SEED: VENDORS\n-- ============================================================\n`;
for (const v of dbData.vendors || []) {
  sql += `INSERT INTO public.vendors (id,name,company_name,vendor_type,status,contact_person,mobile_number,alternative_mobile_number,email,website,street_address,city,state,country,pin_code,gstin,pan,business_reg_no,remarks) VALUES (${q(v.id)},${q(v.name)},${q(v.companyName||v.name)},${q(v.vendorType||'General')},${q(v.status||'Active')},${q(v.contactPerson)},${q(v.mobileNumber)},${q(v.alternativeMobileNumber)},${q(v.email)},${q(v.website)},${q(v.streetAddress)},${q(v.city)},${q(v.state)},${q(v.country)},${q(v.pinCode)},${q(v.gstin)},${q(v.pan)},${q(v.businessRegNo)},${q(v.remarks)}) ON CONFLICT (id) DO NOTHING;\n`;
}

sql += `\n-- ============================================================\n-- SEED: UTILITIES\n-- ============================================================\n`;
for (const u of dbData.utilities || []) {
  sql += `INSERT INTO public.utilities (id,name) VALUES (${q(u.id)},${q(u.name)}) ON CONFLICT (id) DO NOTHING;\n`;
}

sql += `\n-- ============================================================\n-- SEED: PRODUCTS\n-- ============================================================\n`;
for (const p of dbData.products || []) {
  sql += `INSERT INTO public.products (id,vendor_id,name,description,category,brand,product_status,utility_name) VALUES (${q(p.id)},${q(p.vendorId)},${q(p.name)},${q(p.description)},${q(p.category)},${q(p.brand)},${q(p.productStatus||'Active')},${q(p.utilityName)}) ON CONFLICT (id) DO NOTHING;\n`;
}

sql += `\n-- ============================================================\n-- SEED: BOOKINGS (purchase_orders)\n-- ============================================================\n`;
for (const b of dbData.bookings || []) {
  const uid = USER_UUID_MAP[b.userId];
  if (!uid) continue;
  sql += `INSERT INTO public.purchase_orders (id,user_id,instrument_id,start_date,due_date,remarks,status,returned_date,returned_by_name,return_remarks,sheet_url,bulk_group_id) VALUES (${q(b.id)},${q(uid)},${q(b.instrumentId)},${q(b.startDate)},${q(b.dueDate)},${q(b.remarks)},${q(b.status||'pending')},${b.returnedDate?q(b.returnedDate):'NULL'},${q(b.returnedByName)},${q(b.returnRemarks)},${q(b.sheetUrl)},${q(b.bulkGroupId)}) ON CONFLICT (id) DO NOTHING;\n`;
}

sql += `\n-- Setup complete! You can now log in with admin@iitm.com / VcydDPyQRH9@zU7\n`;

fs.writeFileSync(path.join(__dirname, 'supabase_clean_setup.sql'), sql, 'utf8');
console.log('SUCCESS: supabase_clean_setup.sql generated with', (dbData.instruments||[]).length, 'instruments,', (dbData.vendors||[]).length, 'vendors,', (dbData.products||[]).length, 'products,', (dbData.utilities||[]).length, 'utilities');
