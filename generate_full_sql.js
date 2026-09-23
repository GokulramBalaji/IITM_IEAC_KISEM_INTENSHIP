const fs = require('fs');
const path = require('path');

// File paths
const schemaPath = path.join(__dirname, 'supabase_schema.sql');
const dataPath = path.join(__dirname, 'frontend/src/data.json');
const outputPath = path.join(__dirname, 'supabase_setup_full.sql');

function escapeSql(str) {
  if (str === null || str === undefined) return 'NULL';
  return "'" + String(str).replace(/'/g, "''") + "'";
}

function safeJson(arr) {
  if (!arr) return "'[]'::jsonb";
  return escapeSql(JSON.stringify(arr)) + "::jsonb";
}

function main() {
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  const dbData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  let sql = `-- ==========================================================\n`;
  sql += `-- FULL DATABASE INITIALIZATION & HISTORICAL SEEDING SCRIPT\n`;
  sql += `-- Copy this entire script and run it in the Supabase SQL Editor.\n`;
  sql += `-- ==========================================================\n\n`;

  sql += schemaSql;
  sql += `\n\n-- ========================================== \n`;
  sql += `-- SEEDING DATA SECTION\n`;
  sql += `-- ========================================== \n\n`;

  // Map legacy user IDs to UUIDs
  const userUuidMap = {
    'Dk0II5a6': 'd00d2026-c15b-4ef4-81f6-f4e56d31569a',
    'C15PGHGg': 'd00d2026-c15b-4ef4-81f6-f4e56d31569b',
    'QnBaB_lG': 'd00d2026-c15b-4ef4-81f6-f4e56d31569c',
    'r3djUira': 'd00d2026-c15b-4ef4-81f6-f4e56d31569d',
    'l0Or1i2d': 'd00d2026-c15b-4ef4-81f6-f4e56d31569e'
  };

  // 1. Seed public.users ONLY (auth.users already created via REST API seeder)
  sql += `-- 1. Seeding public.users (auth users already exist from REST API seeder)\n`;
  for (const u of dbData.users || []) {
    const uuid = userUuidMap[u.id] || `d00d2026-c15b-4ef4-81f6-${Math.random().toString(36).substring(2, 14)}`;
    const finalEmail = u.email.includes('@') ? u.email : `${u.email}@iitm.com`;
    const role = u.role.charAt(0).toUpperCase() + u.role.slice(1).toLowerCase();
    const normalizedRole = role === 'Engineer' ? 'Engineer' : role === 'Admin' ? 'Admin' : 'Trainee';

    sql += `INSERT INTO public.users (id, name, email, phone, role) \n`;
    sql += `VALUES (${escapeSql(uuid)}, ${escapeSql(u.name)}, ${escapeSql(finalEmail)}, ${escapeSql(u.phone)}, ${escapeSql(normalizedRole)}) \n`;
    sql += `ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, phone = EXCLUDED.phone, role = EXCLUDED.role;\n\n`;
  }


  // 2. Seed public.utilities
  sql += `-- 2. Seeding Utilities\n`;
  for (const u of dbData.utilities || []) {
    sql += `INSERT INTO public.utilities (id, name) VALUES (${escapeSql(u.id)}, ${escapeSql(u.name)}) ON CONFLICT (id) DO NOTHING;\n`;
  }
  sql += `\n`;

  // 3. Seed public.vendors
  sql += `-- 3. Seeding Vendors\n`;
  for (const v of dbData.vendors || []) {
    sql += `INSERT INTO public.vendors (id, name, company_name, vendor_type, status, contact_person, mobile_number, alternative_mobile_number, email, website, street_address, city, state, country, pin_code, gstin, pan, business_reg_no, remarks) \n`;
    sql += `VALUES (\n`;
    sql += `  ${escapeSql(v.id)}, ${escapeSql(v.name)}, ${escapeSql(v.companyName)}, ${escapeSql(v.vendorType)}, ${escapeSql(v.status)},\n`;
    sql += `  ${escapeSql(v.contactPerson)}, ${escapeSql(v.mobileNumber)}, ${escapeSql(v.alternativeMobileNumber)}, ${escapeSql(v.email)}, ${escapeSql(v.website)},\n`;
    sql += `  ${escapeSql(v.streetAddress)}, ${escapeSql(v.city)}, ${escapeSql(v.state)}, ${escapeSql(v.country)}, ${escapeSql(v.pinCode)},\n`;
    sql += `  ${escapeSql(v.gstin)}, ${escapeSql(v.pan)}, ${escapeSql(v.businessRegNo)}, ${escapeSql(v.remarks)}\n`;
    sql += `) ON CONFLICT (id) DO NOTHING;\n\n`;
  }

  // 4. Seed public.products
  sql += `-- 4. Seeding Products\n`;
  for (const p of dbData.products || []) {
    sql += `INSERT INTO public.products (id, vendor_id, name, description, category, brand, product_status, utility_name) \n`;
    sql += `VALUES (${escapeSql(p.id)}, ${escapeSql(p.vendorId)}, ${escapeSql(p.name)}, ${escapeSql(p.description)}, ${escapeSql(p.category)}, ${escapeSql(p.brand)}, ${escapeSql(p.productStatus)}, ${escapeSql(p.utilityName)}) \n`;
    sql += `ON CONFLICT (id) DO NOTHING;\n\n`;
  }

  // 5. Seed public.inventory
  sql += `-- 5. Seeding Inventory (Instruments)\n`;
  for (const i of dbData.instruments || []) {
    const bookedByUuid = i.bookedBy ? (userUuidMap[i.bookedBy] || null) : null;
    sql += `INSERT INTO public.inventory (id, status, location, category, name, brand, model, serial, last_calibration_date, next_calibration_date, calibration_cycle_days, calibration_certificate_url, product_images, product_overview, specifications, parameters_measured, accuracy, measurement_range, resolution, applications, operating_procedure, calibration_procedure, safety_instructions, user_manual_url, youtube_url, booked_by, next_available_date) \n`;
    sql += `VALUES (\n`;
    sql += `  ${escapeSql(i.id)}, ${escapeSql(i.status)}, ${escapeSql(i.location)}, ${escapeSql(i.category)}, ${escapeSql(i.name)}, ${escapeSql(i.brand)}, ${escapeSql(i.model)}, ${escapeSql(i.serial)},\n`;
    sql += `  ${i.lastCalibrationDate ? escapeSql(i.lastCalibrationDate) : 'NULL'}, ${i.nextCalibrationDate ? escapeSql(i.nextCalibrationDate) : 'NULL'}, ${i.calibrationCycleDays || 365}, ${i.calibrationCertificateUrl ? escapeSql(i.calibrationCertificateUrl) : 'NULL'},\n`;
    sql += `  ${safeJson(i.productImages)}, ${escapeSql(i.productOverview)}, ${escapeSql(i.specifications)}, ${escapeSql(i.parametersMeasured)}, ${escapeSql(i.accuracy)},\n`;
    sql += `  ${escapeSql(i.measurementRange)}, ${escapeSql(i.resolution)}, ${escapeSql(i.applications)}, ${escapeSql(i.operatingProcedure)}, ${escapeSql(i.calibrationProcedure)},\n`;
    sql += `  ${escapeSql(i.safetyInstructions)}, ${escapeSql(i.userManualUrl)}, ${escapeSql(i.youtubeUrl)}, ${bookedByUuid ? escapeSql(bookedByUuid) : 'NULL'}, ${i.nextAvailableDate ? escapeSql(i.nextAvailableDate) : 'NULL'}\n`;
    sql += `) ON CONFLICT (id) DO NOTHING;\n\n`;
  }

  // 6. Seed public.purchase_orders
  sql += `-- 6. Seeding Purchase Orders (Bookings)\n`;
  for (const b of dbData.bookings || []) {
    const userUuid = userUuidMap[b.userId] || null;
    if (!userUuid) continue;

    sql += `INSERT INTO public.purchase_orders (id, user_id, instrument_id, start_date, due_date, remarks, status, returned_date, returned_by_name, return_remarks, sheet_url, bulk_group_id) \n`;
    sql += `VALUES (${escapeSql(b.id)}, ${escapeSql(userUuid)}, ${escapeSql(b.instrumentId)}, ${escapeSql(b.startDate)}, ${escapeSql(b.dueDate)}, ${escapeSql(b.remarks)}, ${escapeSql(b.status)}, ${b.returnedDate ? escapeSql(b.returnedDate) : 'NULL'}, ${escapeSql(b.returnedByName)}, ${escapeSql(b.returnRemarks)}, ${escapeSql(b.sheetUrl)}, ${escapeSql(b.bulkGroupId)}) \n`;
    sql += `ON CONFLICT (id) DO NOTHING;\n\n`;
  }

  fs.writeFileSync(outputPath, sql, 'utf8');
  console.log('SUCCESS: Full setup SQL file created successfully at supabase_setup_full.sql');
}

main();
