const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('ERROR: DATABASE_URL environment variable is required to run live database setup.');
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  console.log('Connected to live Supabase Postgres database.');

  try {
    // 1. Run schema DDL
    const schemaSqlPath = path.join(__dirname, 'supabase_schema.sql');
    const schemaSql = fs.readFileSync(schemaSqlPath, 'utf8');
    
    console.log('Executing schema initialization...');
    await client.query(schemaSql);
    console.log('Schema tables, triggers, policies, and functions initialized.');

    // 2. Read data.json to seed
    const dataJsonPath = path.join(__dirname, 'frontend/src/data.json');
    const dbData = JSON.parse(fs.readFileSync(dataJsonPath, 'utf8'));

    // Map legacy user IDs to UUIDs
    const userUuidMap = {
      'Dk0II5a6': 'd00d2026-c15b-4ef4-81f6-f4e56d31569a',
      'C15PGHGg': 'd00d2026-c15b-4ef4-81f6-f4e56d31569b',
      'QnBaB_lG': 'd00d2026-c15b-4ef4-81f6-f4e56d31569c',
      'r3djUira': 'd00d2026-c15b-4ef4-81f6-f4e56d31569d',
      'l0Or1i2d': 'd00d2026-c15b-4ef4-81f6-f4e56d31569e'
    };

    console.time('Seeding');

    // Seeding Users
    console.log('Seeding users...');
    for (const u of dbData.users || []) {
      const uuid = userUuidMap[u.id] || `d00d2026-c15b-4ef4-81f6-${Math.random().toString(36).substring(2, 14)}`;
      const finalEmail = u.email.includes('@') ? u.email : `${u.email}@iitm.com`;
      const metadata = JSON.stringify({ name: u.name, role: u.role, phone: u.phone });

      // Insert into auth.users (trigger will automatically create public.users profile row)
      await client.query(`
        INSERT INTO auth.users (
          id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, 
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user, is_anonymous
        )
        VALUES (
          $1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, $3, now(),
          '{"provider": "email", "providers": ["email"]}', $4, now(), now(), false, false
        ) ON CONFLICT (id) DO UPDATE SET 
          email = EXCLUDED.email,
          encrypted_password = EXCLUDED.encrypted_password,
          raw_user_meta_data = EXCLUDED.raw_user_meta_data;
      `, [uuid, finalEmail, u.password, metadata]);
    }

    // Seeding Utilities
    console.log('Seeding utilities...');
    for (const u of dbData.utilities || []) {
      await client.query(`
        INSERT INTO public.utilities (id, name)
        VALUES ($1, $2) ON CONFLICT (id) DO NOTHING;
      `, [u.id, u.name]);
    }

    // Seeding Vendors
    console.log('Seeding vendors...');
    for (const v of dbData.vendors || []) {
      await client.query(`
        INSERT INTO public.vendors (
          id, name, company_name, vendor_type, status, contact_person, mobile_number, 
          alternative_mobile_number, email, website, street_address, city, state, country, 
          pin_code, gstin, pan, business_reg_no, remarks
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
        ) ON CONFLICT (id) DO NOTHING;
      `, [
        v.id, v.name, v.companyName, v.vendorType, v.status, v.contactPerson, v.mobileNumber,
        v.alternativeMobileNumber, v.email, v.website, v.streetAddress, v.city, v.state, v.country,
        v.pinCode, v.gstin, v.pan, v.businessRegNo, v.remarks
      ]);
    }

    // Seeding Products
    console.log('Seeding products...');
    for (const p of dbData.products || []) {
      await client.query(`
        INSERT INTO public.products (
          id, vendor_id, name, description, category, brand, product_status, utility_name
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING;
      `, [p.id, p.vendorId, p.name, p.description, p.category, p.brand, p.productStatus, p.utilityName]);
    }

    // Seeding Inventory
    console.log('Seeding inventory (instruments)...');
    for (const i of dbData.instruments || []) {
      const bookedByUuid = i.bookedBy ? (userUuidMap[i.bookedBy] || null) : null;
      await client.query(`
        INSERT INTO public.inventory (
          id, status, location, category, name, brand, model, serial, 
          last_calibration_date, next_calibration_date, calibration_cycle_days, calibration_certificate_url,
          product_images, product_overview, specifications, parameters_measured, accuracy, 
          measurement_range, resolution, applications, operating_procedure, calibration_procedure, 
          safety_instructions, user_manual_url, youtube_url, booked_by, next_available_date
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27
        ) ON CONFLICT (id) DO NOTHING;
      `, [
        i.id, i.status, i.location, i.category, i.name, i.brand, i.model, i.serial,
        i.lastCalibrationDate || null, i.nextCalibrationDate || null, i.calibrationCycleDays || 365,
        i.calibrationCertificateUrl || null, JSON.stringify(i.productImages || []), i.productOverview || null,
        i.specifications || null, i.parametersMeasured || null, i.accuracy || null, i.measurementRange || null,
        i.resolution || null, i.applications || null, i.operatingProcedure || null, i.calibrationProcedure || null,
        i.safetyInstructions || null, i.userManualUrl || null, i.youtubeUrl || null, bookedByUuid, i.nextAvailableDate || null
      ]);
    }

    // Seeding Purchase Orders
    console.log('Seeding purchase_orders (bookings)...');
    for (const b of dbData.bookings || []) {
      const userUuid = userUuidMap[b.userId] || null;
      if (!userUuid) continue; // skip orphan bookings
      
      await client.query(`
        INSERT INTO public.purchase_orders (
          id, user_id, instrument_id, start_date, due_date, remarks, status, 
          returned_date, returned_by_name, return_remarks, sheet_url, bulk_group_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (id) DO NOTHING;
      `, [
        b.id, userUuid, b.instrumentId, b.startDate, b.dueDate, b.remarks || null, b.status,
        b.returnedDate || null, b.returnedByName || null, b.returnRemarks || null, b.sheetUrl || null, b.bulkGroupId || null
      ]);
    }

    console.timeEnd('Seeding');
    console.log('Database successfully initialized and seeded with historical records!');

  } catch (err) {
    console.error('Fatal initialization error:', err);
  } finally {
    await client.end();
  }
}

main();
