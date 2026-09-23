-- ==============================================================
-- CLEAN SETUP SQL - NO RLS, NO FK ISSUES
-- Paste this ENTIRE file into Supabase SQL Editor and click RUN.
-- Auth users are already created. This creates tables and seeds data.
-- ==============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop tables in reverse dependency order if re-running
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.purchase_orders CASCADE;
DROP TABLE IF EXISTS public.inventory CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.vendors CASCADE;
DROP TABLE IF EXISTS public.utilities CASCADE;

-- 1. UTILITIES
CREATE TABLE public.utilities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. VENDORS
CREATE TABLE public.vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  vendor_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
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
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. PRODUCTS
CREATE TABLE public.products (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  brand TEXT,
  product_status TEXT NOT NULL DEFAULT 'Active',
  utility_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 4. USERS (no FK to auth.users - avoids insert ordering issues)
CREATE TABLE public.users (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'Engineer',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON public.users(email);

-- 5. INVENTORY
CREATE TABLE public.inventory (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'available',
  location TEXT NOT NULL DEFAULT 'warehouse',
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  serial TEXT NOT NULL,
  last_calibration_date TIMESTAMPTZ,
  next_calibration_date TIMESTAMPTZ,
  calibration_cycle_days INTEGER DEFAULT 365,
  calibration_certificate_url TEXT,
  product_images JSONB DEFAULT '[]'::jsonb,
  product_overview TEXT,
  specifications TEXT,
  parameters_measured TEXT,
  accuracy TEXT,
  measurement_range TEXT,
  resolution TEXT,
  applications TEXT,
  operating_procedure TEXT,
  calibration_procedure TEXT,
  safety_instructions TEXT,
  user_manual_url TEXT,
  youtube_url TEXT,
  booked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  next_available_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 6. PURCHASE ORDERS
CREATE TABLE public.purchase_orders (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  instrument_id TEXT NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  start_date TIMESTAMPTZ NOT NULL,
  due_date TIMESTAMPTZ NOT NULL,
  remarks TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  returned_date TIMESTAMPTZ,
  returned_by_name TEXT,
  return_remarks TEXT,
  sheet_url TEXT,
  bulk_group_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 7. AUDIT LOGS
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  user_email TEXT,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- INDEXES
CREATE INDEX idx_inventory_status ON public.inventory(status);
CREATE INDEX idx_purchase_orders_user ON public.purchase_orders(user_id);
CREATE INDEX idx_purchase_orders_inst ON public.purchase_orders(instrument_id);
CREATE INDEX idx_products_vendor ON public.products(vendor_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at DESC);

-- TRIGGER: sync new auth signups to public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE v_role TEXT;
BEGIN
  v_role := COALESCE(new.raw_user_meta_data->>'role', 'Engineer');
  v_role := CASE WHEN LOWER(v_role)='admin' THEN 'Admin' WHEN LOWER(v_role)='trainee' THEN 'Trainee' ELSE 'Engineer' END;
  INSERT INTO public.users (id, name, email, phone, role)
  VALUES (new.id, COALESCE(new.raw_user_meta_data->>'name','New User'), new.email, COALESCE(new.raw_user_meta_data->>'phone',''), v_role)
  ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, email=EXCLUDED.email, phone=EXCLUDED.phone, role=EXCLUDED.role;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- TRIGGER TO AUTO-CONFIRM SIGNUPS (Bypasses email confirmation completely)
CREATE OR REPLACE FUNCTION public.handle_confirm_user()
RETURNS TRIGGER AS $$
BEGIN
  new.email_confirmed_at := COALESCE(new.email_confirmed_at, now());
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created_confirm ON auth.users;
CREATE TRIGGER on_auth_user_created_confirm
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_confirm_user();

-- ============================================================
-- SEED: USERS (using real UUIDs from auth.users)
-- ============================================================
INSERT INTO public.users (id, name, email, phone, role) VALUES
('d00d2026-c15b-4ef4-81f6-f4e56d315690','Admin User','admin@iitm.com','1234567890','Admin'),
('d00d2026-c15b-4ef4-81f6-f4e56d315691','gokulrambalaji','gokulrambalaji@gmail.com','8428796572','Engineer'),
('d00d2026-c15b-4ef4-81f6-f4e56d315692','iitmadmin','iitmadmin@iit.com','123','Admin'),
('d00d2026-c15b-4ef4-81f6-f4e56d315693','Madhu','mathu@iit.com','123','Engineer'),
('d00d2026-c15b-4ef4-81f6-f4e56d315694','mathu','abc@abc','123','Trainee')
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, email=EXCLUDED.email, phone=EXCLUDED.phone, role=EXCLUDED.role;

-- ============================================================
-- SEED: INSTRUMENTS (inventory)
-- ============================================================
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('ql1fq3Ah','available','warehouse','Power Quality Analyzer','Power Quality Analyzer','Fluke','Fluke 1775','PQF01','2026-07-06T09:04:59.492Z','2027-07-06T09:04:59.492Z',365,'https://drive.google.com/file/d/19C2UvYthFPEPU-eb851_ioxMEfi6ojdR/view?usp=drive_link','["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRHIZgcZ4skdxuHAELZgPGqNwOrD92BCL7FZgt0cSE8MQ&s=10"]'::jsonb,'The Fluke 1775 Power Quality Analyzer is a three-phase portable power quality monitoring instrument designed for troubleshooting, energy audits, preventive maintenance, and compliance testing. It records electrical parameters continuously while identifying disturbances such as voltage sags, swells, harmonics, transients, flicker, imbalance, and power interruptions. The analyzer supports automatic measurement setup, advanced waveform capture, event recording, and long-duration data logging. It complies with IEC 61000-4-30 Class A standards, making it suitable for utility, industrial, and commercial applications.','Parameter	        Specification
Instrument Type	        Three Phase Power Quality Analyzer
Voltage Channels	4
Current Channels	4
Frequency	        50/60 Hz
Data Storage	        Internal Memory
Communication	        USB, Ethernet, Wi-Fi
Display         	7-inch Color Touchscreen
CAT Rating	        CAT IV 600 V / CAT III 1000 V
Compliance	        IEC 61000-4-30 Class A
Battery         	Rechargeable Lithium-ion','Phase Voltage,
Line Voltage,
Phase Current,
Neutral Current,
Frequency,
Active Power (kW),
Reactive Power (kVAR),
Apparent Power (kVA),
Power Factor,
Energy Consumption (kWh),
Demand,
Harmonics,
Total Harmonic Distortion (THD),
Voltage Unbalance,
Current Unbalance,
Voltage Sag,
Voltage Swell,
Interruptions,
Flicker,
Transients,
Crest Factor,
Inrush Current.','Voltage	±0.1% of reading , Current	±0.2% of reading (depends on probe),   Frequency	±0.01 Hz ,  Active Power	 ±0.5%,   Energy	±0.5% , Harmonics  	IEC Class A Compliance.','Voltage	1 V to 1000 V AC,   Current	-Depends on Current Clamp (typically 0.5 A to 6000 A) , Frequency	42.5–69 Hz,  Power-	Up to system capacity , Harmonics	 0–100% , THD	0–100%.','Voltage	0.01 V , Current	0.01 A , Frequency	0.01 Hz , Power	0.01 kW,  Energy	0.001 kWh , Harmonics	0.1%.','Industrial Energy Audits
Transformer Loading Analysis
Motor Performance Evaluation
Power Quality Studies
Electrical Maintenance
Utility Distribution Monitoring
Harmonic Analysis
Renewable Energy Systems
Building Electrical Systems
Compliance Testing','Inspect the analyzer and accessories.
Verify calibration status.
Connect voltage leads to the three phases and neutral.
Connect current clamps in the correct direction.
Power on the analyzer.
Select wiring configuration.
Verify phase sequence.
Configure recording duration.
Start measurement.
Monitor real-time electrical parameters.
Save recorded data.
Transfer data to PC using Fluke Energy Analyze Plus software.
Disconnect probes safely.
Store the analyzer properly.','Clean the instrument.
Inspect voltage leads and current clamps.
Connect the analyzer to a certified calibration source.
Apply known reference voltages.
Apply calibrated current.
Verify voltage accuracy.
Verify current accuracy.
Verify frequency measurement.
Verify harmonic measurements.
Adjust calibration if required.
Perform functional verification.
Generate calibration certificate.
Label calibration date.
Record calibration history.','Wear appropriate PPE.
Verify CAT rating before use.
Inspect test leads before connecting.
Never exceed rated voltage.
Connect neutral first when applicable.
Ensure correct current clamp orientation.
Do not touch live conductors.
Disconnect power before removing probes whenever possible.
Use insulated gloves.
Avoid wet environments.
Follow lock-out/tag-out procedures.
Store in a dry location.
Recharge battery using approved charger only.
Follow manufacturer''s operating manual.','https://drive.google.com/file/d/1v13iXFX3bYSmW7FO8kQB22EO2uNXjDEd/view?usp=drive_link','https://youtu.be/QaBlpZpG8Is?si=_5I0AVCIMpQPdd5h',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('G-U0Vpbz','available','warehouse','Power Quality Analyzer','Power Quality Analyzer','Fluke','Fluke 1775','PQF02','2026-07-03T12:27:20.040Z','2027-07-03T12:27:20.040Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRHIZgcZ4skdxuHAELZgPGqNwOrD92BCL7FZgt0cSE8MQ&s=10"]'::jsonb,'The Fluke 1775 Power Quality Analyzer is a three-phase portable power quality monitoring instrument designed for troubleshooting, energy audits, preventive maintenance, and compliance testing. It records electrical parameters continuously while identifying disturbances such as voltage sags, swells, harmonics, transients, flicker, imbalance, and power interruptions. The analyzer supports automatic measurement setup, advanced waveform capture, event recording, and long-duration data logging. It complies with IEC 61000-4-30 Class A standards, making it suitable for utility, industrial, and commercial applications.','Parameter	Specification
Instrument Type	Three Phase Power Quality Analyzer
Voltage Channels	4
Current Channels	4
Frequency	50/60 Hz
Data Storage	Internal Memory
Communication	USB, Ethernet, Wi-Fi
Display	7-inch Color Touchscreen
CAT Rating	CAT IV 600 V / CAT III 1000 V
Compliance	IEC 61000-4-30 Class A
Battery	Rechargeable Lithium-ion','Phase Voltage
Line Voltage
Phase Current
Neutral Current
Frequency
Active Power (kW)
Reactive Power (kVAR)
Apparent Power (kVA)
Power Factor
Energy Consumption (kWh)
Demand
Harmonics
Total Harmonic Distortion (THD)
Voltage Unbalance
Current Unbalance
Voltage Sag
Voltage Swell
Interruptions
Flicker
Transients
Crest Factor
Inrush Current','Voltage	±0.1% of reading , Current	±0.2% of reading (depends on probe),   Frequency	±0.01 Hz ,  Active Power	 ±0.5%,   Energy	±0.5% , Harmonics  	IEC Class A Compliance','Voltage	1 V to 1000 V AC,   Current	-Depends on Current Clamp (typically 0.5 A to 6000 A) , Frequency	42.5–69 Hz,  Power-	Up to system capacity , Harmonics	 0–100% , THD	0–100%.','Voltage	0.01 V , Current	0.01 A , Frequency	0.01 Hz , Power	0.01 kW,  Energy	0.001 kWh , Harmonics	0.1%','Industrial Energy Audits
Transformer Loading Analysis
Motor Performance Evaluation
Power Quality Studies
Electrical Maintenance
Utility Distribution Monitoring
Harmonic Analysis
Renewable Energy Systems
Building Electrical Systems
Compliance Testing','Inspect the analyzer and accessories.
Verify calibration status.
Connect voltage leads to the three phases and neutral.
Connect current clamps in the correct direction.
Power on the analyzer.
Select wiring configuration.
Verify phase sequence.
Configure recording duration.
Start measurement.
Monitor real-time electrical parameters.
Save recorded data.
Transfer data to PC using Fluke Energy Analyze Plus software.
Disconnect probes safely.
Store the analyzer properly.','Clean the instrument.
Inspect voltage leads and current clamps.
Connect the analyzer to a certified calibration source.
Apply known reference voltages.
Apply calibrated current.
Verify voltage accuracy.
Verify current accuracy.
Verify frequency measurement.
Verify harmonic measurements.
Adjust calibration if required.
Perform functional verification.
Generate calibration certificate.
Label calibration date.
Record calibration history.','Wear appropriate PPE.
Verify CAT rating before use.
Inspect test leads before connecting.
Never exceed rated voltage.
Connect neutral first when applicable.
Ensure correct current clamp orientation.
Do not touch live conductors.
Disconnect power before removing probes whenever possible.
Use insulated gloves.
Avoid wet environments.
Follow lock-out/tag-out procedures.
Store in a dry location.
Recharge battery using approved charger only.
Follow manufacturer''s operating manual.','https://drive.google.com/file/d/1v13iXFX3bYSmW7FO8kQB22EO2uNXjDEd/view?usp=drive_link','https://youtu.be/QaBlpZpG8Is?si=_5I0AVCIMpQPdd5h',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('Hgom_Xs6','available','warehouse','Power Quality Analyzer','Power Quality Analyzer','Hioki','Hioki PQ3100','PQH03','2026-06-24T08:45:46.837Z','2027-06-24T08:45:46.837Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTS9BgoelRF_BpFLWG_-xG0zvjjlsxb87_FZZkxR8z6kw&s"]'::jsonb,'The Hioki PQ3100 Power Quality Analyzer is a compact, portable three-phase power quality analyzer designed for continuous monitoring, troubleshooting, and analysis of electrical power systems. It complies with IEC 61000-4-30 Class A standards and accurately records voltage, current, power, harmonics, flicker, transients, and power quality events. The instrument supports long-term data logging and waveform recording, making it ideal for industrial plants, commercial buildings, utility networks, and energy audit applications. Its rugged construction and intuitive interface enable engineers to perform reliable measurements in demanding field environments.','Parameter	       Specification
Instrument Type	        Three-Phase Power Quality Analyzer
Voltage Channels	4
Current Channels	4
Frequency	        50/60 Hz
Display	                6.5-inch Color LCD
Data Storage	        SD Memory Card
Communication	        USB, LAN
Battery          	Rechargeable Battery Pack
Safety Rating	        CAT IV 600 V / CAT III 1000 V
Compliance	        IEC 61000-4-30 Class A
Operating Temperature	-10°C to +50°C
Protection Class	IP40','Phase Voltage,
Line Voltage,
Phase Current,
Neutral Current,
Frequency,
Active Power (kW),
Reactive Power (kVAR),
Apparent Power (kVA),
Power Factor,
Energy Consumption (kWh),
Demand,
Voltage Harmonics,
Current Harmonics,
Total Harmonic Distortion (THD),
Voltage Unbalance,
Current Unbalance,
Voltage Sag,
Voltage Swell,
Interruptions,
Flicker,
Transients,
Inrush Current.','Voltage	±0.1% of reading , Current	±0.2% of reading (Probe dependent),  Frequency	±0.01 Hz , Active Power	±0.3% of reading , Energy	±0.3% of reading , Harmonics 	IEC Class A Compliance.','Voltage	0.1 V to 1000 V AC, Current	Depends on Current Sensor (typically 0.5 A to 6000 A),  Frequency	40–70 Hz,  Power	Up to system capacity , Harmonics	Up to 50th Order ,THD	0–100%.','Voltage	0.01 V ,Current	0.01 A ,Frequency	0.01 Hz ,Power	0.01 kW ,Energy	0.001 kWh ,Harmonics	0.1%.','Industrial Energy Audits
Power Quality Monitoring
Electrical Distribution System Analysis
Transformer Load Analysis
Motor Performance Monitoring
Harmonic Analysis
Utility Network Monitoring
Renewable Energy System Evaluation
Preventive Maintenance
Electrical Troubleshooting
Compliance Testing
Long-Term Power Monitoring','Inspect the analyzer, voltage leads, and current sensors for any damage.
Verify that the instrument is within its calibration period.
Connect the voltage leads to the three phases and neutral.
Connect the current sensors to each phase with the arrow pointing toward the load.
Switch ON the analyzer.
Select the appropriate wiring configuration.
Verify phase sequence and correct sensor orientation.
Configure the recording interval and monitoring duration.
Start the measurement.
Observe real-time electrical parameters and waveform displays.
Record power quality events during the monitoring period.
Save the measurement data to the SD memory card.
Transfer the recorded data to a computer using Hioki analysis software.
Disconnect all probes safely after completing the measurement.
Store the analyzer in its protective carrying case.','Clean the analyzer and inspect all connectors and accessories.
Verify the condition of voltage leads and current sensors.
Connect the analyzer to a certified voltage and current calibration source.
Apply known AC voltage values and verify readings.
Apply calibrated AC current values and verify measurements.
Check frequency accuracy using a reference frequency source.
Verify power and energy calculations.
Test harmonic measurement accuracy.
Perform functional verification of event recording and waveform capture.
Adjust calibration settings if necessary using authorized calibration software.
Generate a calibration certificate after successful verification.
Attach a calibration label showing the calibration date and due date.
Record the calibration details in the calibration log.','Read the operating manual before using the instrument.
Only qualified personnel should operate the analyzer.
Wear appropriate Personal Protective Equipment (PPE).
Verify that the analyzer''s CAT IV 600 V / CAT III 1000 V rating is suitable for the measurement.
Inspect all voltage leads and current sensors before use.
Never use damaged cables or accessories.
Ensure correct phase identification before making connections.
Do not exceed the instrument''s maximum voltage or current ratings.
Avoid touching exposed live conductors during measurements.
Follow Lockout/Tagout (LOTO) procedures whenever possible.
Keep the analyzer away from moisture and corrosive environments.
Use only approved accessories and replacement parts.
Recharge the battery using the recommended charger.
Store the instrument in a clean, dry, and dust-free location.
Calibrate the instrument annually to maintain measurement accuracy.','https://drive.google.com/file/d/1WyabyAiZBbUp9llPkosZLj9bzxfFp3dT/view?usp=drive_link','https://youtu.be/LuxxeuaJtZg?si=NjuF5rPcaFzwIpTM',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('Cq1qyvHO','available','warehouse','Power Quality Analyzer','Power Quality Analyzer','Krykard','Krykard ALM36','PQK04','2026-05-25T05:31:03.500Z','2026-09-25T05:31:03.500Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRWCRMf33cBHreQeZYg0wbTkESj69aS_AaJTjtaXIvHOQ&s"]'::jsonb,'The Krykard ALM36 Power Quality Analyzer is a portable three-phase electrical measurement instrument designed for power quality analysis, energy auditing, preventive maintenance, and troubleshooting of electrical distribution systems. It measures and records voltage, current, power, energy, harmonics, frequency, power factor, and power quality disturbances such as voltage sags, swells, interruptions, and transients. The analyzer provides real-time monitoring, waveform capture, and long-term data logging, enabling engineers to identify electrical problems, improve energy efficiency, and maintain system reliability. Its rugged construction, user-friendly interface, and comprehensive measurement capabilities make it suitable for industrial, commercial, and utility applications.','Parameter	Specification
Instrument Type	Three-Phase Power Quality Analyzer
Voltage Channels	4
Current Channels	4
Frequency	50/60 Hz
Display	7-inch Color TFT LCD
Data Storage	Internal Memory and USB Storage
Communication	USB, Ethernet
Battery	Rechargeable Lithium-ion Battery
Safety Rating	CAT IV 600 V / CAT III 1000 V
Compliance	IEC 61000-4-30 Class S
Operating Temperature	-10°C to +50°C
Storage Temperature	-20°C to +60°C
Protection Class	IP40','Phase Voltage
Line Voltage
Neutral Voltage
Phase Current
Neutral Current
Frequency
Active Power (kW)
Reactive Power (kVAR)
Apparent Power (kVA)
Power Factor
Displacement Power Factor
Active Energy (kWh)
Reactive Energy (kVARh)
Apparent Energy (kVAh)
Demand
Voltage Harmonics
Current Harmonics
Total Harmonic Distortion (THD)
Voltage Unbalance
Current Unbalance
Voltage Sag
Voltage Swell
Voltage Interruptions
Flicker
Transients
Inrush Current
Crest Factor','Measurement	Accuracy Voltage	±0.2% of reading Current	±0.5% of reading (Sensor dependent) Frequency	±0.01 Hz Active Power	±0.5% of reading Reactive Power	±0.5% of reading Energy	±0.5% of reading Power Factor	±0.01 Harmonics	±2% of reading','Parameter	Range AC Voltage	10 V to 1000 V AC AC Current	Depends on Current Clamp (Typically 1 A to 5000 A) Frequency	40 Hz to 70 Hz Active Power	Up to System Capacity Reactive Power	Up to System Capacity Apparent Power	Up to System Capacity Power Factor	-1.000 to +1.000 Harmonics	Up to 50th Order THD	0% to 100% Energy	Unlimited Data Logging','Parameter	Resolution Voltage	0.01 V Current	0.01 A Frequency	0.01 Hz Active Power	0.01 kW Reactive Power	0.01 kVAR Apparent Power	0.01 kVA Energy	0.001 kWh Power Factor	0.001 Harmonics	0.1% THD	0.1%','Industrial Energy Audits
Electrical Power Quality Assessment
Distribution Panel Monitoring
Transformer Performance Analysis
Motor Load Analysis
Harmonic Investigation
Utility Power Distribution Monitoring
Preventive Maintenance Programs
Renewable Energy System Evaluation
Commercial Building Energy Monitoring
Manufacturing Plant Electrical Diagnostics
Data Logging for Long-Term Power Analysis
Electrical Commissioning
Power System Troubleshooting
Compliance Verification','Inspect the analyzer, voltage leads, and current clamps for any physical damage.
Ensure the instrument has a valid calibration certificate.
Charge the battery or connect external power if required.
Connect the voltage leads to the appropriate phases (L1, L2, L3, and Neutral).
Attach the current clamps to each phase conductor, ensuring the arrows point toward the load.
Switch ON the analyzer.
Select the appropriate wiring configuration (Single Phase, Three Phase 3-Wire, or Three Phase 4-Wire).
Verify the phase sequence and current clamp orientation.
Configure the recording interval, event thresholds, and monitoring duration.
Start the measurement and verify real-time readings.
Monitor voltage, current, power, harmonics, and power quality events.
Save the recorded data in the internal memory or USB storage.
Transfer the measurement data to a computer using the analysis software.
Disconnect the current clamps and voltage leads after completing the measurements.
Clean the instrument and store it safely in its protective carrying case.','Visually inspect the analyzer and all accessories.
Clean the instrument using a dry, lint-free cloth.
Connect the analyzer to a certified calibration source.
Apply known AC voltage values and verify measurement accuracy.
Apply reference AC current values using calibrated current sources.
Verify frequency measurement using a traceable frequency standard.
Check active, reactive, and apparent power calculations.
Verify energy measurement accuracy.
Test harmonic and THD measurement performance.
Perform functional testing for event recording and waveform capture.
Adjust calibration values if required using manufacturer-approved software.
Generate and issue a calibration certificate.
Attach a calibration label indicating the calibration and due dates.
Record all calibration results in the instrument maintenance log.

Recommended Calibration Interval: Every 12 months.','Read and understand the operating manual before using the analyzer.
Only qualified personnel should perform measurements.
Wear appropriate Personal Protective Equipment (PPE), including insulated gloves and safety glasses.
Verify that the instrument''s CAT IV 600 V / CAT III 1000 V safety rating is suitable for the application.
Inspect voltage leads and current clamps before every use.
Do not use damaged or worn accessories.
Ensure proper phase identification before connecting the analyzer.
Never exceed the maximum rated voltage or current.
Avoid touching exposed live conductors while measurements are in progress.
Follow Lockout/Tagout (LOTO) procedures whenever possible.
Keep the analyzer away from water, excessive humidity, and explosive atmospheres.
Use only manufacturer-approved accessories and replacement parts.
Recharge the battery only with the recommended charger.
Store the analyzer in a clean, dry, and dust-free environment.
Perform annual calibration to maintain measurement accuracy and reliability.','https://drive.google.com/file/d/1szdP65jTmFyM2wDevdzyzdu_NnWcNjCm/view?usp=drive_link','https://youtu.be/db9VYmm_DhI?si=uvxJltM2kkR5keRw',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('ymiNjydl','available','warehouse','Power Logger','Power Logger','Hioki','Hioki PW3360-20','PWH05','2026-05-25T05:31:03.500Z','2026-09-26T05:31:03.500Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRlmob1AdsRpdMSyIzuHjDvpH09rwtARyXVZaD1UZws2A&s=10"]'::jsonb,'The Hioki PW3360-20 Power Logger is a compact, portable single-phase to three-phase power logger designed for energy monitoring, electrical load studies, and energy audits. It measures and records voltage, current, power, power factor, frequency, and energy consumption over extended periods without interrupting normal system operation. The instrument is ideal for identifying energy-saving opportunities, monitoring electrical equipment performance, and evaluating load profiles in industrial, commercial, and institutional facilities.

The PW3360-20 features non-contact current measurement using clamp sensors, long-term data logging to an SD memory card, USB communication, and battery operation for convenient field use. It is widely used by energy auditors, maintenance engineers, and electrical consultants.','Parameter	         Specification
Instrument Type	         Portable Power Logger
Measurement System	 Single-phase / Three-phase
Voltage Channels	 3
Current Channels	 3
Frequency	         50/60 Hz
Display	                 Backlit LCD
Data Storage	         SD Memory Card
Communication	         USB 2.0
Power Supply	         AC Adapter / AA Batteries
Safety Rating	         CAT III 600 V
Operating Temperature	-10°C to +50°C
Storage Temperature	-20°C to +60°C
Protection Class	IP50','Phase Voltage,
Line Voltage,
Phase Current,
Frequency,
Active Power (kW),
Reactive Power (kVAR),
Apparent Power (kVA),
Power Factor,
Phase Angle,
Active Energy (kWh),
Reactive Energy (kVARh),
Apparent Energy (kVAh),
Maximum Demand,
Average Demand,
Peak Power,
Current Demand,
Voltage Demand,
Load Profile,
Power Consumption Trend.','Voltage	±0.3% of reading,  Current	±0.3% of reading (Sensor dependent),  Frequency	±0.02 Hz,  Active Power	±0.5% of reading , Reactive Power	±0.5% of reading , Apparent Power	±0.5% of reading , Energy	±0.5% of reading , Power Factor	±0.02.','AC Voltage	90 V to 520 V AC , AC Current	Depends on Current Sensor (Typically 0.5 A to 5000 A) , Frequency	45 Hz to 66 Hz , Active Power	Up to System Capacity , Reactive Power	Up to System Capacity ,  Apparent Power	Up to System Capacity  , Power Factor	-1.000 to +1.000,  Energy	Unlimited Data Logging , Demand	-Configurable.','Voltage	0.1 V , Current	0.01 A,  Frequency	0.01 Hz , Active Power	0.01 kW , Reactive Power	0.01 kVAR,  Apparent Power	0.01 kVA , Energy	0.001 kWh , Power Factor	0.001 , Demand	0.01 kW.','Industrial Energy Audits
Electrical Load Surveys
Building Energy Monitoring
Transformer Load Analysis
Motor Energy Consumption Monitoring
HVAC Energy Analysis
Manufacturing Plant Energy Management
Commercial Building Power Monitoring
Preventive Maintenance
Electrical Distribution Studies
Demand Analysis
Energy Conservation Projects
Utility Billing Verification
Long-Term Power Logging
Electrical Performance Evaluation','Inspect the power logger, voltage leads, and current sensors for any physical damage.
Verify that the instrument is within its calibration period.
Insert the SD memory card into the instrument.
Install fully charged batteries or connect the AC adapter.
Connect the voltage leads to the appropriate measurement points.
Attach the current clamps to the corresponding phase conductors with the arrow pointing toward the load.
Switch ON the power logger.
Select the appropriate wiring configuration.
Configure the logging interval and recording duration.
Verify that voltage, current, and phase sequence are correct.
Start data logging.
Allow the logger to record data for the required monitoring period.
Stop the recording after completion.
Save the measurement data.
Transfer the recorded data to a computer using the Hioki analysis software.
Disconnect all leads and current sensors safely.
Store the instrument in its protective carrying case.','Clean the instrument and inspect all accessories.
Verify the condition of voltage leads and current sensors.
Connect the power logger to a certified voltage calibration source.
Apply known AC voltage values and verify readings.
Apply calibrated current values using a traceable current source.
Verify frequency measurement using a precision frequency generator.
Check active, reactive, and apparent power calculations.
Verify power factor accuracy.
Test energy accumulation using a reference energy standard.
Perform functional verification of the data logging system.
Adjust calibration if required according to manufacturer procedures.
Generate a calibration certificate.
Affix a calibration label indicating the calibration and due dates.
Record the calibration information in the maintenance log.

Recommended Calibration Interval: Every 12 months.','Read the operating manual before using the instrument.
Only qualified personnel should perform electrical measurements.
Wear appropriate Personal Protective Equipment (PPE).
Verify that the instrument''s CAT III 600 V safety rating is suitable for the application.
Inspect voltage leads and current clamps before every measurement.
Replace damaged accessories immediately.
Ensure proper phase identification before connecting the logger.
Never exceed the maximum rated voltage or current.
Avoid touching exposed live conductors during measurements.
Secure the logger in a safe location during long-term monitoring.
Follow Lockout/Tagout (LOTO) procedures whenever possible.
Keep the instrument away from water, excessive humidity, and corrosive environments.
Use only manufacturer-approved accessories and replacement parts.
Remove the batteries if the instrument will not be used for an extended period.
Perform annual calibration to ensure continued measurement accuracy.','https://drive.google.com/file/d/15_iAbZ_PwUqFUvmb8ccHIbwzbqXC0YFT/view?usp=drive_link','https://youtu.be/BaBdf2Ogo_Q?si=xX2gci2cvC0IY3h5',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('hu41OzMM','available','warehouse','Clamp Meter','Clamp Meter','Hioki','Hioki CM3286-50','PCH06','2026-05-25T05:31:03.500Z','2026-09-27T05:31:03.500Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRIyfmJgNbQcbjDJ4gPrThv8IBN0VC2p_QGJxzydNnnDg&s=10"]'::jsonb,'The Hioki CM3286-50 Clamp Meter is a compact, lightweight, and high-performance digital clamp meter designed for measuring AC current without interrupting electrical circuits. In addition to current measurement, it measures AC/DC voltage, resistance, continuity, and frequency, making it a versatile instrument for electrical maintenance, energy audits, industrial troubleshooting, and equipment inspection.

The CM3286-50 features a large jaw opening, True RMS measurement, auto-ranging, data hold, and overload protection. Its slim design allows measurements in confined electrical panels and distribution boards. The instrument complies with international safety standards and is widely used by electrical engineers, maintenance technicians, and energy auditors.','Parameter	        Specification
Instrument Type	        Digital Clamp Meter
Brand	                Hioki
Model	                CM3286-50
Serial Number	        PCH06
Measurement Method	True RMS
Display	                4-digit LCD
Jaw Opening	        33 mm
Auto Range	        Yes
Data Hold	        Yes
Continuity Buzzer	Yes
Power Supply	        CR2032 Lithium Battery
Safety Rating	        CAT IV 300 V / CAT III 600 V
Operating Temperature	-25°C to +65°C
Storage Temperature	-30°C to +70°C','AC Current (True RMS),
AC Voltage,
DC Voltage,
Resistance,
Frequency,
Continuity,
Diode Test,
Overload Indication,
Data Hold Function,
Auto Power-Off Status.','AC Current	±1.5% of reading ±5digits,  AC Voltage	±1.0% of reading ±3 digits,  DC Voltage 	±1.0% of reading ±3 digits, Resistance	±1.0% of reading ±5 digits,  Frequency	±0.1% of reading , Continuity-	Audible indication below specified resistance.','AC Current	0.00 A to 1000 A , AC Voltage	0 V to 600 V , DC Voltage	0 V to 600 V , Resistance	0 Ω to 42 MΩ , Frequency	5 Hz to 500 Hz , Continuity	-Up to approximately 50 Ω.',' AC Current	0.01 A,  AC Voltage	0.1 V,  DC Voltage	0.1 V,  Resistance	0.1 Ω,  Frequency	0.1 Hz,  Continuity	0.1 Ω.','Industrial Electrical Maintenance
Energy Audit Measurements
Motor Current Monitoring
Distribution Panel Inspection
Electrical Troubleshooting
Transformer Load Measurement
HVAC Equipment Maintenance
Building Electrical Inspection
Preventive Maintenance Programs
Electrical Safety Inspections
Power Distribution System Monitoring
Laboratory Testing
Equipment Commissioning
Educational and Training Applications
Field Service Engineering','Inspect the clamp meter and test leads for any visible damage.
Verify that the battery has sufficient charge.
Ensure the instrument has a valid calibration label.
Turn the rotary switch to the desired measurement function.
For current measurement, open the clamp jaw using the trigger.
Clamp around only one conductor; never clamp around both phase and neutral simultaneously.
Ensure the conductor is centered within the jaw for accurate measurement.
Read the measured value on the display.
For voltage measurement, connect the test leads to the appropriate terminals and measure across the circuit.
For resistance or continuity measurements, ensure the circuit is de-energized before testing.
Use the Data Hold function if required to freeze the displayed reading.
After completing the measurement, remove the clamp or test leads safely.
Turn OFF the instrument to conserve battery life.
Store the clamp meter in its protective carrying case.','Clean the instrument and inspect the clamp jaw and test leads.
Verify that the battery voltage is within the acceptable range.
Connect the clamp meter to a certified calibration system.
Apply known AC current values using a current calibrator.
Verify AC current readings across the measurement range.
Apply calibrated AC and DC voltages using a voltage calibrator.
Verify voltage measurement accuracy.
Connect certified resistance standards to verify resistance measurement.
Test the continuity function using a calibrated resistance source.
Verify frequency measurement using a precision signal generator.
Perform functional checks for display, data hold, and auto power-off features.
Adjust calibration if required according to the manufacturer''s service procedure.
Issue a calibration certificate.
Affix a calibration label indicating the calibration and next due dates.
Record calibration details in the maintenance log.

Recommended Calibration Interval: Every 12 months.','Read the operating manual before using the clamp meter.
Only qualified personnel should perform electrical measurements.
Wear appropriate Personal Protective Equipment (PPE), including insulated gloves and safety glasses.
Verify that the instrument''s CAT IV 300 V / CAT III 600 V safety rating is suitable for the application.
Inspect the clamp jaw, test leads, and housing before each use.
Never use the instrument if any damage is observed.
Clamp around only one conductor during current measurements.
Do not exceed the maximum rated voltage or current.
Never measure resistance or continuity on a live circuit.
Keep fingers behind the protective finger guards while using the test leads.
Avoid using the instrument in wet, damp, or explosive environments.
Replace the battery only with the specified type.
Clean the instrument with a soft, dry cloth; do not use solvents.
Store the clamp meter in a clean, dry, and dust-free environment.
Perform annual calibration to maintain measurement accuracy and reliability.','https://drive.google.com/file/d/1UqestHztqAzAzJv1J7Vtxdkzu-2ARcEv/view?usp=drive_link','https://youtu.be/emEJ3i4nYf4?si=Y7wOTobVbcWvX1i_',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('6-vm-eZU','available','warehouse','Clamp Meter','Clamp Meter','Krykard','Krykard F409','PCK07','2026-05-25T05:31:03.500Z','2026-09-28T05:31:03.500Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRIyfmJgNbQcbjDJ4gPrThv8IBN0VC2p_QGJxzydNnnDg&s=10"]'::jsonb,'The Krykard F409 Clamp Meter is a professional True RMS digital clamp meter designed for measuring AC/DC current, AC/DC voltage, resistance, continuity, frequency, capacitance, and other electrical parameters. It is suitable for industrial maintenance, electrical installations, preventive maintenance, energy audits, and troubleshooting of electrical equipment. The clamp meter enables non-contact current measurement without disconnecting conductors, ensuring safe and efficient operation.

The instrument features a large backlit LCD display, auto-ranging, data hold, minimum/maximum recording, inrush current measurement, and overload protection. Its ergonomic design and robust construction make it ideal for use in industrial environments, electrical panels, motors, transformers, generators, and distribution systems.','Parameter	            Specification
Instrument Type        	    Digital True RMS Clamp Meter
Measurement Method	    True RMS
Display	                    6000-count Backlit LCD
Jaw Opening	            42 mm
Auto Range	            Yes
Data Hold	            Yes
Min/Max Recording	    Yes
Inrush Current Measurement	Yes
Continuity Buzzer	    Yes
Power Supply	            9 V Battery
Safety Rating	            CAT IV 600 V / CAT III 1000 V
Operating Temperature	   -10°C to +50°C
Storage Temperature	   -20°C to +60°C','AC Current (True RMS), 
DC Current, 
AC Voltage, 
DC Voltage, 
Resistance, 
Frequency, 
Capacitance, 
Duty Cycle, 
Continuity, 
Diode Test, 
Inrush Current, 
Minimum Value, 
Maximum Value, 
Relative Measurement, 
Data Hold, 
Auto Power-Off.',' AC Current	±1.5% of reading ±5 digits,  DC Current	±1.5% of reading ±5 digits,  AC Voltage	±1.0% of reading ±3 digits,  DC Voltage	±0.8% of reading ±2 digits , Resistance	±1.0% of reading ±3 digits , Frequency	±0.5% of reading , Capacitance	±2.5% of reading,  Continuity-	Audible indication below specified resistance.','AC Current	0 A to 1000 A , DC Current	0 A to 1000 A , AC Voltage	0 V to 1000 V,  DC Voltage	0 V to 1000 V , Resistance	0 Ω to 60 MΩ , Frequency	10 Hz to 10 kHz , Capacitance	1 nF to 100 mF , Duty Cycle	0% to 99.9% , Continuity	-Up to approximately 50 Ω.',' AC Current	0.01 A,  DC Current	0.01 A , AC Voltage	0.1 V,  DC Voltage	0.1 V , Resistance	0.1 Ω , Frequency	0.1 Hz , Capacitance	1 nF,  Duty Cycle	0.1%.','Industrial Electrical Maintenance
Energy Audit Measurements
Electrical Troubleshooting
Motor Current Analysis
Transformer Load Monitoring
Generator Testing
Electrical Panel Inspection
Preventive Maintenance
Building Electrical Services
HVAC System Maintenance
Solar PV System Inspection
UPS and Battery System Testing
Manufacturing Plant Maintenance
Electrical Installation Verification
Laboratory and Educational Applications','Inspect the clamp meter, clamp jaw, and test leads for any signs of damage.
Verify that the battery is fully charged and the calibration is valid.
Turn the rotary selector switch to the desired measurement function.
For current measurements, press the trigger to open the clamp jaw.
Clamp around only one conductor and ensure it is centered within the jaw.
Read the displayed current value.
For voltage measurements, connect the red and black test leads to the appropriate terminals and measure across the circuit.
Ensure the circuit is de-energized before measuring resistance, continuity, or capacitance.
Use the Data Hold function to freeze readings if required.
Use the Min/Max function to capture fluctuating values.
Record the measurement results.
Disconnect the test leads or remove the clamp from the conductor after measurements.
Turn OFF the instrument to conserve battery power.
Clean the instrument and return it to its protective carrying case.','Clean the instrument and inspect the clamp jaw and test leads.
Check the battery condition and replace it if necessary.
Connect the clamp meter to a certified electrical calibrator.
Apply known AC and DC current values using a calibrated current source.
Verify current measurement accuracy over the full measurement range.
Apply known AC and DC voltage values using a traceable voltage calibrator.
Verify voltage measurement accuracy.
Connect precision resistance standards to verify resistance measurement.
Verify frequency measurement using a calibrated signal generator.
Test capacitance measurement using certified capacitor standards.
Verify continuity and diode test functions.
Perform functional verification of the display, data hold, and Min/Max features.
Adjust calibration if required according to the manufacturer''s procedures.
Generate a calibration certificate.
Affix a calibration label indicating the calibration and due dates.
Record all calibration information in the maintenance log.

Recommended Calibration Interval: Every 12 months.','Read the operating manual before using the clamp meter.
Only trained and qualified personnel should operate the instrument.
Wear appropriate Personal Protective Equipment (PPE), including insulated gloves and eye protection.
Verify that the instrument''s CAT IV 600 V / CAT III 1000 V safety rating is suitable for the application.
Inspect the clamp jaw, housing, and test leads before every use.
Do not use the instrument if it is damaged or malfunctioning.
Clamp around only one conductor during current measurements.
Never exceed the specified voltage or current limits.
Ensure the circuit is de-energized before measuring resistance, continuity, capacitance, or diode functions.
Keep fingers behind the protective finger guards while using the test leads.
Avoid operating the instrument in wet, humid, or explosive environments.
Replace the battery only with the recommended type.
Clean the instrument using a soft, dry cloth; avoid the use of solvents.
Store the clamp meter in a clean, dry, and dust-free environment.
Perform annual calibration to ensure measurement accuracy and compliance with quality standards.','https://drive.google.com/file/d/1lTOo4EOEP_BUoqgJmMOtzdZ9YkUoaFJT/view?usp=drive_link','https://youtu.be/3INLQ8u6ZFE?si=XW21MQw0RONYWgwF',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('LnMSNlgk','available','warehouse','Clamp Meter','Clamp Meter','Hioki','Hioki CM3286-50','PCH08','2026-05-25T05:31:03.500Z','2026-09-29T05:31:03.500Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRIyfmJgNbQcbjDJ4gPrThv8IBN0VC2p_QGJxzydNnnDg&s=10"]'::jsonb,'The Hioki CM3286-50 Clamp Meter is a compact, lightweight, and high-performance digital clamp meter designed for measuring AC current without interrupting electrical circuits. In addition to current measurement, it measures AC/DC voltage, resistance, continuity, and frequency, making it a versatile instrument for electrical maintenance, energy audits, industrial troubleshooting, and equipment inspection.

The CM3286-50 features a large jaw opening, True RMS measurement, auto-ranging, data hold, and overload protection. Its slim design allows measurements in confined electrical panels and distribution boards. The instrument complies with international safety standards and is widely used by electrical engineers, maintenance technicians, and energy auditors.','Parameter	          Specification
Instrument Type	          Digital Clamp Meter
Measurement Method	  True RMS
Display	                  4-digit LCD
Jaw Opening            	  33 mm
Auto Range	          Yes
Data Hold	          Yes
Continuity Buzzer	  Yes
Power Supply	          CR2032 Lithium Battery
Safety Rating	          CAT IV 300 V / CAT III 600 V
Operating Temperature	  -25°C to +65°C
Storage Temperature	  -30°C to +70°C','AC Current (True RMS),
AC Voltage,
DC Voltage,
Resistance, 
Frequency,
Continuity, 
Diode Test, 
Overload Indication, 
Data Hold Function, 
Auto Power-Off Status.','AC Current	±1.5% of reading ±5 digits , AC Voltage	±1.0% of reading ±3 digits,  DC Voltage	±1.0% of reading ±3 digits , Resistance	±1.0% of reading ±5 digits , Frequency	±0.1% of reading , Continuity	-Audible indication below specified resistance','AC Current	0.00 A to 1000 A,  AC Voltage	0 V to 600 V,  DC Voltage	0 V to 600 V,  Resistance	0 Ω to 42 MΩ , Frequency	5 Hz to 500 Hz , Continuity	Up to approximately 50 Ω.','AC Current	0.01 A , AC Voltage	0.1 V,  DC Voltage	0.1 V,  Resistance	0.1 Ω , Frequency	0.1 Hz , Continuity	0.1 Ω.','Industrial Electrical Maintenance
Energy Audit Measurements
Motor Current Monitoring
Distribution Panel Inspection
Electrical Troubleshooting
Transformer Load Measurement
HVAC Equipment Maintenance
Building Electrical Inspection
Preventive Maintenance Programs
Electrical Safety Inspections
Power Distribution System Monitoring
Laboratory Testing
Equipment Commissioning
Educational and Training Applications
Field Service Engineering','Inspect the clamp meter and test leads for any visible damage.
Verify that the battery has sufficient charge.
Ensure the instrument has a valid calibration label.
Turn the rotary switch to the desired measurement function.
For current measurement, open the clamp jaw using the trigger.
Clamp around only one conductor; never clamp around both phase and neutral simultaneously.
Ensure the conductor is centered within the jaw for accurate measurement.
Read the measured value on the display.
For voltage measurement, connect the test leads to the appropriate terminals and measure across the circuit.
For resistance or continuity measurements, ensure the circuit is de-energized before testing.
Use the Data Hold function if required to freeze the displayed reading.
After completing the measurement, remove the clamp or test leads safely.
Turn OFF the instrument to conserve battery life.
Store the clamp meter in its protective carrying case.','Clean the instrument and inspect the clamp jaw and test leads.
Verify that the battery voltage is within the acceptable range.
Connect the clamp meter to a certified calibration system.
Apply known AC current values using a current calibrator.
Verify AC current readings across the measurement range.
Apply calibrated AC and DC voltages using a voltage calibrator.
Verify voltage measurement accuracy.
Connect certified resistance standards to verify resistance measurement.
Test the continuity function using a calibrated resistance source.
Verify frequency measurement using a precision signal generator.
Perform functional checks for display, data hold, and auto power-off features.
Adjust calibration if required according to the manufacturer''s service procedure.
Issue a calibration certificate.
Affix a calibration label indicating the calibration and next due dates.
Record calibration details in the maintenance log.

Recommended Calibration Interval: Every 12 months.','Read the operating manual before using the clamp meter.
Only qualified personnel should perform electrical measurements.
Wear appropriate Personal Protective Equipment (PPE), including insulated gloves and safety glasses.
Verify that the instrument''s CAT IV 300 V / CAT III 600 V safety rating is suitable for the application.
Inspect the clamp jaw, test leads, and housing before each use.
Never use the instrument if any damage is observed.
Clamp around only one conductor during current measurements.
Do not exceed the maximum rated voltage or current.
Never measure resistance or continuity on a live circuit.
Keep fingers behind the protective finger guards while using the test leads.
Avoid using the instrument in wet, damp, or explosive environments.
Replace the battery only with the specified type.
Clean the instrument with a soft, dry cloth; do not use solvents.
Store the clamp meter in a clean, dry, and dust-free environment.
Perform annual calibration to maintain measurement accuracy and reliability.','https://drive.google.com/file/d/1UqestHztqAzAzJv1J7Vtxdkzu-2ARcEv/view?usp=drive_link','https://youtu.be/emEJ3i4nYf4?si=Y7wOTobVbcWvX1i_',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('PeoP47wl','available','warehouse','Clamp Meter','Clamp Meter','Krykard','Krykard F409','PCK09','2026-05-25T05:31:03.500Z','2026-09-30T05:31:03.500Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSPhZWZZWrZESwTka13NXm6OWqfxpIh6TongCshAy6PZw&s=10"]'::jsonb,'The Krykard F409 Clamp Meter is a professional True RMS digital clamp meter designed for accurate measurement of AC/DC current, AC/DC voltage, resistance, frequency, capacitance, continuity, and other essential electrical parameters. It enables non-contact current measurement, allowing electricians and engineers to measure current safely without disconnecting the electrical circuit. The instrument is suitable for industrial maintenance, energy audits, electrical installations, preventive maintenance, and troubleshooting of motors, transformers, generators, HVAC systems, and power distribution panels.

The clamp meter features a large backlit LCD display, automatic ranging, minimum/maximum recording, inrush current measurement, data hold, overload protection, and a rugged ergonomic design. Its high accuracy and reliability make it an excellent choice for field engineers and maintenance professionals.','Parameter	            Specification
Instrument Type	Digital     True RMS Clamp Meter
Measurement Method	    True RMS
Display	                    6000-count Backlit LCD
Jaw Opening	            42 mm
Auto Range	            Yes
Data Hold	            Yes
Min/Max Recording	    Yes
Inrush Current Measurement  Yes
Continuity Buzzer	    Yes
Power Supply	            9 V Battery
Safety Rating	            CAT IV 600 V / CAT III 1000 V
Operating Temperature	    -10°C to +50°C
Storage Temperature	    -20°C to +60°C','AC Current (True RMS),
DC Current,
AC Voltage,
DC Voltage,
Resistance,
Frequency,
Capacitance,
Duty Cycle,
Continuity,
Diode Test,
Inrush Current,
Minimum Value,
Maximum Value,
Relative Measurement,
Data Hold,
Auto Power-Off.','AC Current	±1.5% of reading ±5 digits, DC Current	±1.5% of reading ±5 digits,  AC Voltage	±1.0% of reading ±3 digits , DC Voltage	±0.8% of reading ±2 digits , Resistance	±1.0% of reading ±3 digits , Frequency	±0.5% of reading , Capacitance	±2.5% of reading , Continuity	-Audible indication below specified resistance.',' AC Current	0 A to 1000 A, DC Current	0 A to 1000 A,  AC Voltage	0 V to 1000 V ,DC Voltage	0 V to 1000 V ,Resistance	0 Ω to 60 MΩ ,Frequency	10 Hz to 10 kHz, Capacitance	1 nF to 100 mF .Duty Cycle	0% to 99.9% ,Continuity	Up to approximately 50 Ω.','AC Current	0.01 A ,DC Current	0.01 A,  AC Voltage	0.1 V,  DC Voltage	0.1 V,  Resistance	0.1 Ω , Frequency	0.1 Hz , Capacitance	1 nF , Duty Cycle	0.1%.','Industrial Electrical Maintenance
Energy Audit Measurements
Electrical Troubleshooting
Motor Current Analysis
Transformer Load Monitoring
Generator Testing
Electrical Panel Inspection
Preventive Maintenance
Building Electrical Services
HVAC System Maintenance
Solar PV System Inspection
UPS and Battery System Testing
Manufacturing Plant Maintenance
Electrical Installation Verification
Laboratory and Educational Applications','Inspect the clamp meter, clamp jaw, and test leads for any visible damage.
Verify that the battery is fully charged and the calibration certificate is valid.
Turn the rotary selector switch to the required measurement function.
For current measurement, press the trigger to open the clamp jaw.
Clamp around only one conductor and position it at the center of the jaw.
Read the measured current value on the display.
For voltage measurements, connect the test leads to the appropriate input terminals and measure across the circuit.
Ensure the circuit is de-energized before measuring resistance, continuity, capacitance, or diode functions.
Use the Data Hold function to freeze the displayed value if required.
Use the Min/Max function to capture fluctuating readings during operation.
Record the measurement results for documentation.
Remove the clamp from the conductor or disconnect the test leads after completing the measurements.
Switch OFF the instrument to conserve battery life.
Clean the instrument and store it safely in its carrying case.','Inspect and clean the clamp meter, clamp jaw, and test leads.
Verify the battery condition before calibration.
Connect the instrument to a certified electrical calibration system.
Apply traceable AC current values and verify measurement accuracy.
Apply calibrated DC current values and compare readings.
Verify AC and DC voltage measurements using a precision voltage calibrator.
Check resistance measurement using certified resistance standards.
Verify frequency accuracy using a calibrated frequency generator.
Test capacitance measurement using certified capacitor standards.
Verify continuity and diode test functions.
Perform functional verification of the display, Data Hold, Min/Max, and auto power-off features.
Adjust calibration if required according to manufacturer procedures.
Generate a calibration certificate.
Attach a calibration label indicating the calibration date and next due date.
Record all calibration information in the maintenance log.

Recommended Calibration Interval: Every 12 months.','Read the operating manual thoroughly before using the clamp meter.
Only qualified personnel should perform electrical measurements.
Wear appropriate Personal Protective Equipment (PPE), including insulated gloves, safety glasses, and protective footwear.
Verify that the instrument''s CAT IV 600 V / CAT III 1000 V safety rating is suitable for the intended application.
Inspect the clamp jaw, housing, and test leads before every use.
Never use the instrument if any damage or malfunction is observed.
Clamp around only one conductor during current measurements.
Never exceed the instrument''s maximum voltage or current ratings.
Ensure the circuit is de-energized before measuring resistance, continuity, capacitance, or diode functions.
Keep fingers behind the protective finger guards while using the test leads.
Avoid using the instrument in wet, humid, or explosive environments.
Replace the battery only with the recommended battery type.
Clean the instrument with a soft, dry cloth; avoid using chemicals or solvents.
Store the clamp meter in a clean, dry, and dust-free environment.
Perform annual calibration to maintain measurement accuracy, reliability, and compliance with quality standards.','https://drive.google.com/file/d/1lTOo4EOEP_BUoqgJmMOtzdZ9YkUoaFJT/view?usp=drive_link','https://youtu.be/3INLQ8u6ZFE?si=XW21MQw0RONYWgwF',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('Ey3k7EXu','available','warehouse','Ultrasonic Water Flow Meter','Ultrasonic Water Flow Meter','Acron','TR600H','UWA10','2026-05-25T05:31:03.500Z','2026-10-01T05:31:03.500Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS3xBQRSPjzY1LieheIzsUfVYd7DF2CfrFumtZZUjnwTw&s=10"]'::jsonb,'The Acron TR600H Ultrasonic Water Flow Meter is a portable, non-invasive flow measurement instrument designed to measure the flow rate of clean liquids without interrupting the pipeline or cutting the pipe. It utilizes the transit-time ultrasonic measurement principle, where ultrasonic signals are transmitted and received between two externally mounted transducers to accurately calculate the flow velocity and volumetric flow rate.

The TR600H is widely used for energy audits, HVAC systems, water supply networks, chilled water systems, industrial process monitoring, and maintenance applications. Its clamp-on transducers eliminate the need for pipe modifications, making installation quick, safe, and cost-effective. The instrument provides high measurement accuracy, built-in data logging, rechargeable battery operation, and a user-friendly color display for field applications.','Parameter	         Specification
Instrument Type	         Portable Ultrasonic Water Flow Meter
Measurement Principle	 Transit-Time Ultrasonic
Display	                 Color LCD Touchscreen
Data Storage	         Internal Memory
Communication	         USB
Data Logging	         Yes
Power Supply	         Rechargeable Lithium-ion Battery
Pipe Size	         DN15 to DN6000
Pipe Material	         Steel, Stainless Steel, PVC, Copper, Cast Iron, HDPE and others
Protection Class	 IP65
Operating Temperature	 -20°C to +60°C
Storage Temperature	 -30°C to +70°C','Flow Velocity, 
Volumetric Flow Rate, 
Totalized Flow, 
Positive Total Flow, 
Negative Total Flow, 
Net Total Flow, 
Instantaneous Flow, 
Flow Direction, 
Signal Strength, 
Signal Quality, 
Transit Time, 
Temperature (with optional sensors), 
Operating Time, 
Pipe Diameter, 
Fluid Velocity.','Flow Rate	±1.0% of reading , Flow Velocity	±1.0% of reading , Repeatability	±0.2% , Linearity	±0.5%,  Time Measurement	±0.01%.',' Flow Velocity	0.01 to 32 m/s , Pipe Diameter	DN15 to DN6000,  Fluid Temperature	-30°C to +160°C (Depending on Sensor) , Totalizer	0 to 99999999 m³ , Signal Strength	0 to 999 , Operating Time	-Continuous Logging.','Flow Velocity	0.001 m/s , Flow Rate	0.001 m³/h , Total Flow	0.01 m³,  Temperature	0.1°C , Pipe Diameter	1 mm,  Time	1 second.','Industrial Energy Audits
Water Distribution Systems
Chilled Water Flow Measurement
Cooling Water Monitoring
Boiler Feed Water Systems
HVAC System Performance Analysis
Building Water Management
Process Water Monitoring
Pump Performance Testing
Water Treatment Plants
Irrigation Systems
Chemical Process Industries
Food and Beverage Industries
Pharmaceutical Plants
Preventive Maintenance Programs','Inspect the flow meter, ultrasonic transducers, cables, and accessories for any physical damage.
Verify that the instrument is within its calibration period.
Charge the battery fully before field operation.
Clean the external surface of the pipe where the transducers will be mounted.
Measure and enter the pipe material, pipe outer diameter, pipe wall thickness, and fluid type into the instrument.
Apply ultrasonic coupling gel to the transducers.
Mount the transducers on the pipe according to the recommended spacing shown by the instrument.
Connect the transducers to the flow meter.
Switch ON the instrument.
Verify signal strength and signal quality before starting measurements.
Allow the readings to stabilize.
Record flow rate, flow velocity, and totalized flow values.
Save the measurement data in the internal memory if required.
Remove the transducers carefully after completing the measurement.
Clean the transducers and store the instrument in its carrying case.','Clean the instrument and inspect the transducers, cables, and connectors.
Verify battery condition and instrument functionality.
Connect the flow meter to a certified ultrasonic flow calibration system or flow calibration rig.
Apply known reference flow rates through the calibration setup.
Verify flow velocity measurements.
Compare measured flow rate with the certified reference values.
Verify totalizer accuracy.
Check signal strength and signal quality functions.
Perform linearity testing across low, medium, and high flow rates.
Adjust calibration parameters if required according to manufacturer procedures.
Perform a final functional verification.
Generate a calibration certificate.
Affix a calibration label showing the calibration date and due date.
Record all calibration results in the instrument maintenance log.

Recommended Calibration Interval: Every 12 months.','Read the operating manual before operating the instrument.
Only trained personnel should use the flow meter.
Wear appropriate Personal Protective Equipment (PPE) when working near industrial pipelines.
Ensure the pipeline is safe to access before mounting the transducers.
Verify that the pipe surface temperature is within the allowable operating range of the transducers.
Use the correct amount of ultrasonic coupling gel for accurate measurements.
Secure the transducers properly to prevent movement during measurement.
Do not expose the instrument to excessive moisture or direct rain unless appropriate protection is provided.
Avoid pulling or twisting the transducer cables during operation.
Clean the transducers after each use to maintain measurement accuracy.
Store the instrument in a clean, dry, and dust-free environment.
Recharge the battery only with the manufacturer-approved charger.
Do not attempt to open or repair the instrument unless authorized.
Perform annual calibration to maintain measurement accuracy and traceability.
Follow all site safety procedures and Lockout/Tagout (LOTO) requirements when working near industrial equipment.','https://drive.google.com/file/d/1Q1JJXgH_cjOSjahbk0B2-GaNud6FvFwP/view?usp=drive_link','https://youtu.be/JRKlR4YgMHw?si=Okrqzcnr9EcZZIA3',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('wxerSEpq','available','warehouse','Ultrasonic Water Flow Meter','Ultrasonic Water Flow Meter','Flexim','F601','UWF11','2026-05-25T05:31:03.500Z','2026-10-02T05:31:03.500Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ3yJykWJ7N9A4n6leyUIZp980xNdFpXrklo_AYfF08_Q&s"]'::jsonb,'The Flexim F601 Ultrasonic Water Flow Meter is a high-precision portable clamp-on ultrasonic flow meter designed for non-invasive measurement of liquid flow in closed pipes. It utilizes the transit-time ultrasonic principle to accurately measure flow without interrupting the process or cutting the pipeline. The Flexim F601 is widely recognized for its excellent measurement stability, high accuracy, and ability to measure a wide range of clean liquids under varying operating conditions.

The instrument is extensively used in energy audits, HVAC systems, water distribution networks, industrial process monitoring, cooling water systems, chilled water circuits, and pump performance testing. Its clamp-on sensors allow quick installation on metal and non-metallic pipes, minimizing downtime and eliminating pressure losses associated with inline flow meters.','Parameter	        Specification
Measurement Principle	Transit-Time Ultrasonic
Display	                High-Resolution Color LCD
Data Storage	        Internal Memory with Data Logging
Communication	        USB, Ethernet
Data Logging	        Yes
Power Supply	        Rechargeable Lithium-ion Battery / AC Adapter
Pipe Size	        DN6 to DN6500
Pipe Material	        Steel, Stainless Steel, Copper, PVC, Cast Iron, HDPE, Aluminum and others
Protection Class	IP65
Operating Temperature	-20°C to +60°C
Storage Temperature	-30°C to +70°C','Flow Velocity, 
Volumetric Flow Rate, 
Mass Flow Rate (with density input), 
Totalized Flow, 
Positive Flow Total, 
Negative Flow Total, 
Net Flow Total, 
Instantaneous Flow, 
Flow Direction, 
Signal Strength, 
Signal Quality, 
Transit Time, 
Fluid Temperature (with optional temperature sensors), 
Operating Time, 
Pipe Diameter, 
Reynolds Number (calculated).','Flow Rate	±1.0% of reading ,Flow Velocity	±1.0% of reading ,Repeatability	±0.15% ,Linearity	±0.5% , Transit Time Measurement	±0.01%.','Flow Velocity	0.01 to 25 m/s,  Pipe Diameter	DN6 to DN6500 , Fluid Temperature	-40°C to +200°C (Sensor dependent) , Totalizer	0 to 999999999 m³ , Signal Strength	0 to 100% , Operating Time	-Continuous Data Logging','Flow Velocity	0.001 m/s,  Flow Rate	0.001 m³/h , Total Flow	0.001 m³,  Temperature	0.1°C , Pipe Diameter	1 mm , Time	1 second.','Industrial Energy Audits
Water Distribution Network Analysis
Cooling Water System Monitoring
Chilled Water Flow Measurement
HVAC Performance Testing
Pump Efficiency Evaluation
Boiler Feed Water Monitoring
Industrial Process Control
Water Treatment Plants
Chemical Processing Industries
Food and Beverage Manufacturing
Pharmaceutical Water Systems
Building Utility Management
Irrigation and Agricultural Water Systems
Preventive Maintenance Programs','Inspect the flow meter, ultrasonic sensors, cables, and accessories for any physical damage.
Verify that the instrument has a valid calibration certificate.
Fully charge the battery or connect the AC power adapter.
Select a straight section of pipe free from valves, elbows, or other flow disturbances.
Clean the pipe surface thoroughly to ensure proper sensor contact.
Measure and enter the pipe material, outside diameter, wall thickness, lining material, and fluid type into the instrument.
Apply ultrasonic coupling gel evenly to the sensor faces.
Mount the clamp-on sensors at the recommended spacing provided by the instrument.
Connect the sensors to the flow meter.
Switch ON the instrument and verify signal strength and signal quality.
Wait until stable readings are obtained.
Record the flow velocity, flow rate, and totalized flow values.
Save measurement data using the internal data logger if required.
Remove the sensors carefully after completing the measurements.
Clean the sensors and store the instrument in its protective carrying case.','Clean the instrument, sensors, cables, and connectors.
Verify battery condition and instrument functionality.
Connect the instrument to a certified ultrasonic flow calibration facility or reference flow rig.
Apply known reference flow rates across the operating range.
Verify flow velocity measurements.
Compare measured flow rates with certified reference values.
Verify totalizer operation.
Check signal strength and signal quality functions.
Perform repeatability and linearity tests.
Adjust calibration parameters if required using manufacturer-approved software.
Perform final functional verification.
Generate a calibration certificate.
Affix a calibration label indicating the calibration and next due dates.
Record all calibration information in the instrument maintenance log.

Recommended Calibration Interval: Every 12 months.','Read and understand the operating manual before using the instrument.
Only trained and authorized personnel should perform measurements.
Wear appropriate Personal Protective Equipment (PPE) when working around industrial piping.
Ensure the pipeline is safe to access before mounting the sensors.
Verify that the pipe surface temperature is within the allowable operating range of the ultrasonic sensors.
Use only the recommended ultrasonic coupling gel.
Secure the sensors properly to prevent movement during measurements.
Avoid placing sensors near excessive vibration or mechanical impacts.
Do not bend, twist, or pull the sensor cables excessively.
Protect the instrument from rain, excessive moisture, and direct sunlight during outdoor use.
Clean the sensors after every use to maintain measurement accuracy.
Recharge the battery only with the manufacturer-approved charger.
Store the instrument in a clean, dry, and dust-free environment.
Perform annual calibration to ensure measurement accuracy and traceability.
Follow all applicable plant safety procedures and Lockout/Tagout (LOTO) requirements when working near operating equipment.','https://drive.google.com/file/d/1xvhAolHzJM35-hbzbUEcXDNWdGrPiOm4/view?usp=drive_link','https://youtu.be/CtMRXeX1-Ac?si=qFXoKyr0Fn9lCiU-',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('RSywpOEK','available','warehouse','Air Flow Meter','Air Flow Meter','VPS','VPS-R250-M100-D11-PN16','AFV12','2026-05-25T05:31:03.500Z','2026-10-03T05:31:03.500Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR1eeAQ5_fv8l_zCLfW3yqRtr3w4vuQNGapvZakQpmI2g&s"]'::jsonb,'The VPS-R250-M100-D11-PN16 Air Flow Meter is a high-accuracy inline thermal mass flow meter designed for measuring compressed air and other industrial gases. It incorporates four sensors in one instrument, enabling simultaneous measurement of flow, pressure, temperature, and totalized flow. The instrument uses Thermabridge™ thermal mass sensing technology for accurate measurement of dry, clean gases and includes a built-in display with an integrated data logger. It is commonly used for compressed air audits, leakage detection, energy monitoring, cost allocation, and condition monitoring of pneumatic systems.','Parameter	        Specification
Measurement Principle	Thermabridge™ Thermal Mass Flow
Display                	3-Line LCD with Backlight
Data Logger	        Integrated (2 Million Data Points)
Communication	        RS485 (Modbus RTU), USB
Analog Output	        4–20 mA
Pulse Output	        Yes
Power Supply	        24 VDC
Nominal Pipe Size	1 inch (DN25)
Pressure Rating	        PN16 (16 bar)
Protection Class	IP65
Operating Medium	Dry Compressed Air and Technical Gases
Operating Temperature	0°C to +60°C (Electronics)','Air Flow Rate, 
Air Velocity, 
Totalized Air Consumption, 
Line Pressure, 
Air Temperature, 
Mass Flow, 
Volumetric Flow, 
Bi-directional Flow (Optional), 
Flow Direction, 
Instantaneous Flow, 
Average Flow, 
Peak Flow, 
Operating Hours, 
Signal Status, 
Data Logging Information. ','Flow Measurement	±2% of reading (Typical),  Repeatability	±0.5% of reading,  Temperature	±1°C,  Pressure	±0.5% Full Scale , Totalized Flow-	Same as Flow Measurement.',' Flow Rate	0.91 to 250 Nm³/h (1-inch model) ,Air Velocity	0.5 to 60 m/s ,Pressure	Up to 16 bar (PN16 Version) , Temperature	0°C to +60°C , Totalizer	0 to 999999999 Nm³ , Operating Pressure	0 to 16 bar.','Flow Rate	0.01 Nm³/h , Air Velocity	0.01 m/s,  Pressure	0.01 bar , Temperature	0.1°C , Totalized Flow	0.001 Nm³ , Time	1 second.','Compressed Air Energy Audits
Leakage Detection Programs
Compressed Air Consumption Monitoring
Industrial Energy Management
Cost Allocation Between Production Lines
Pneumatic Equipment Performance Monitoring
Compressor Efficiency Analysis
Manufacturing Plants
Food Processing Industries
Pharmaceutical Industries
Automotive Manufacturing
Chemical Industries
Utility Monitoring
Preventive Maintenance
ISO 50001 Energy Management Systems','Inspect the flow meter and verify there is no physical damage.
Confirm that the instrument has a valid calibration certificate.
Ensure the pipeline is depressurized before installation if required.
Install the flow meter in the correct flow direction as indicated by the arrow on the body.
Ensure sufficient straight pipe lengths upstream and downstream according to manufacturer recommendations.
Connect the power supply (24 VDC) and communication cables if required.
Switch ON the instrument.
Verify that the display initializes correctly.
Configure the gas type, pipe size, and engineering units if necessary.
Allow the instrument to stabilize before taking measurements.
Monitor flow rate, pressure, temperature, and totalized flow on the display.
Record measurements or enable the built-in data logger for continuous monitoring.
Download recorded data using USB or Modbus communication if required.
After completion, verify all data has been saved before disconnecting power.
Clean the instrument exterior and maintain proper operating conditions.','Visually inspect the flow meter and electrical connections.
Clean the sensing elements if recommended by the manufacturer.
Connect the instrument to a certified compressed air flow calibration rig.
Apply multiple reference flow rates across the operating range.
Compare the measured flow values with certified reference standards.
Verify pressure measurement using a traceable pressure calibrator.
Verify temperature measurement using a calibrated temperature source.
Check totalized flow accumulation accuracy.
Verify analog output (4–20 mA) and Modbus communication.
Perform repeatability and linearity tests.
Adjust calibration coefficients if permitted by the manufacturer.
Perform final functional verification.
Generate a calibration certificate.
Attach a calibration label indicating the calibration and due dates.
Record all calibration results in the instrument maintenance log.

Recommended Calibration Interval: Every 12 months.','Read the operating manual before using the instrument.
Installation should be carried out only by qualified personnel.
Wear appropriate Personal Protective Equipment (PPE).
Ensure the pipeline pressure does not exceed the instrument''s PN16 pressure rating.
Depressurize the pipeline before removing or servicing the instrument.
Install the flow meter in the correct flow direction.
Avoid exposure to corrosive gases unless the instrument is specifically rated for them.
Ensure proper electrical grounding before powering the instrument.
Do not exceed the specified operating temperature limits.
Protect communication cables from mechanical damage.
Keep the sensing element clean to maintain measurement accuracy.
Avoid water ingress into electrical connectors.
Store the instrument in a clean and dry environment when not in use.
Perform annual calibration to maintain traceability and measurement accuracy.
Follow all plant safety procedures and Lockout/Tagout (LOTO) requirements during installation and maintenance.','https://drive.google.com/file/d/1AE2cYXx84efRhiWfV3z5cOT72HgjbUg0/view?usp=drive_link','https://youtu.be/05okJD5Cg3U?si=_EwZLUJ_Md1FCZUk',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('pVGTEirq','available','warehouse','Acoustic Imager','Acoustic Imager','Fluke','ii910','ACF13','2026-05-25T05:31:03.500Z','2026-10-04T05:31:03.500Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS3IvhHWIlOBP20kSQJn6aBTxTtygIMicP7W3GDAyrgYA&s=10"]'::jsonb,'The Fluke ii910 Precision Acoustic Imager is an advanced handheld acoustic imaging camera designed for detecting compressed air, gas, steam, and vacuum leaks, as well as identifying partial discharge (PD) in high-voltage electrical systems. Using an array of 64 high-sensitivity microphones and Fluke''s SoundSight™ technology, the instrument converts ultrasonic sound into a visual image, allowing maintenance personnel to quickly locate faults from a safe distance. It also includes LeakQ™, MecQ™, and PDQ™ modes for leak quantification, mechanical fault detection, and partial discharge classification. The ii910 significantly improves predictive maintenance, energy efficiency, and electrical safety in industrial facilities','parameter	        Specification
Acoustic Sensors	64 MEMS Microphones
Frequency Range	        2 kHz to 100 kHz
Detection Distance	0.5 m to >120 m
Display	                7-inch Color LCD Touchscreen
Display Resolution	1280 × 800 pixels
Camera Resolution	5 MP Visible Camera
Digital Zoom	        3×
Image Storage	        20 GB Internal Memory
Image Format	        JPG / PNG
Video Format	        MP4
Communication	        USB-C
Battery	                Rechargeable Lithium-ion
Protection Class	IP40
Operating Temperature	0°C to +40°C','Ultrasonic Sound Intensity, 
Sound Pressure Level (dB SPL), 
Acoustic Frequency, 
Compressed Air Leak Location, 
Gas Leak Location, 
Steam Leak Detection, 
Vacuum Leak Detection, 
Partial Discharge Detection, 
Corona Discharge Detection, 
Surface Tracking Detection, 
Arcing Detection, 
Mechanical Noise, 
Bearing Defects, 
Valve Leakage, 
Leak Size Estimation (LeakQ™), 
Energy Loss Estimation, 
Leak Cost Estimation, 
Acoustic Image (SoundMap™), 
Image and Video Recording.',' Acoustic Level	±1 dB SPL (Typical depending on frequency band),  Leak Detection	-High Sensitivity with LeakQ™ Analysis,  Partial Discharge Detection	-High Accuracy using PDQ™ Mode , Mechanical Fault Detection	-High Accuracy using MecQ™ Mode , Repeatability	±1% Typical.','Frequency	2 kHz to 100 kHz,  Detection Distance	0.5 m to >120 m , Acoustic Level	Approximately 12 dB SPL to 135 dB SPL (Frequency dependent) , Image Storage	>5000 Images , Video Recording	Up to 5 minutes per recording , Digital Zoom	-3×.','Acoustic Level	-0.1 dB ,Frequency	1 kHz I, mage Resolution	5 MP , Display Resolution	1280 × 800 Pixels , Video Resolution	HD Time	1 second.','Compressed Air Leak Detection
Gas Leak Detection
Steam Leak Inspection
Vacuum System Leak Detection
High Voltage Partial Discharge Inspection
Corona Discharge Detection
Surface Tracking Detection
Arc Detection
Transformer Inspection
Switchgear Inspection
Busbar Inspection
Insulator Inspection
Circuit Breaker Inspection
Mechanical Fault Diagnosis
Predictive Maintenance Programs
Industrial Energy Audits
Electrical Safety Inspections
Utility and Power Distribution Maintenance
Manufacturing Plant Maintenance
Reliability-Centered Maintenance (RCM)','Inspect the acoustic imager for any visible damage.
Verify that the battery is fully charged and the calibration is valid.
Switch ON the instrument using the power button.
Select the appropriate inspection mode (LeakQ™, MecQ™, or PDQ™).
Adjust the frequency range manually or use a preset suitable for the application.
Hold the instrument and slowly scan the equipment or pipeline from a safe distance.
Observe the SoundMap™ overlay on the display to identify the sound source.
Adjust gain settings if necessary to improve detection in noisy environments.
Capture images or videos of detected faults.
Add notes or asset identification if required.
Save the inspection data to internal memory.
Transfer data to a computer using the USB-C connection for reporting.
Switch OFF the instrument after completing the inspection.
Clean the instrument exterior and store it in its protective carrying case.','Inspect the instrument, microphone array, camera lens, and display.
Clean the microphone array using approved cleaning methods.
Verify battery condition and charging performance.
Connect the instrument to an authorized Fluke calibration system if applicable.
Verify microphone sensitivity using a certified acoustic reference source.
Check frequency response across the operating frequency range.
Verify camera alignment with the acoustic image.
Perform functional testing of LeakQ™, MecQ™, and PDQ™ modes.
Verify image capture, video recording, and storage functions.
Confirm USB communication and data transfer.
Update firmware if recommended by the manufacturer.
Perform final operational verification.
Generate a calibration or functional verification certificate.
Attach a calibration label with calibration and due dates.
Record calibration details in the maintenance log.

Recommended Calibration Interval: Every 12 months or according to the manufacturer''s maintenance schedule.','Read the user manual completely before operating the instrument.
Only trained personnel should perform inspections.
Wear appropriate Personal Protective Equipment (PPE).
Maintain the recommended safe distance when inspecting energized high-voltage equipment.
Never touch live electrical conductors while performing inspections.
Ensure the battery is adequately charged before field use.
Avoid blocking the microphone array during measurements.
Keep the camera lens and microphones clean.
Do not expose the instrument to excessive moisture, rain, or corrosive chemicals.
Protect the instrument from severe impacts or vibration.
Use only genuine Fluke batteries, chargers, and accessories.
Backup inspection data regularly.
Store the instrument in its protective carrying case when not in use.
Perform annual calibration and firmware updates as recommended.
Follow all plant safety procedures and Lockout/Tagout (LOTO) requirements during inspections.','https://drive.google.com/file/d/19C2UvYthFPEPU-eb851_ioxMEfi6ojdR/view?usp=drive_link','https://youtu.be/Mcq7nSLqtWM?si=nEQVbSREFzBNQQ0g',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('Pay_AYUf','available','warehouse','Acoustic Imager','Acoustic Imager','Fluke','ii500','ACF14','2026-05-25T05:31:03.500Z','2026-10-05T05:31:03.500Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS5MBBtbCAsgPghvgRCYoMnm52h8B1g6pROnrdS6zd4fw&s=10"]'::jsonb,'The Fluke ii500 Acoustic Imager is a portable acoustic imaging camera designed for the rapid detection and visualization of compressed air, gas, vacuum, and steam leaks in industrial systems. Using an array of highly sensitive MEMS microphones and SoundMap™ technology, it converts ultrasonic sound into a visual image overlaid on a digital photograph, enabling maintenance personnel to quickly locate leaks even in noisy industrial environments.

The ii500 features LeakQ™ technology, which estimates leak severity and potential energy losses, allowing maintenance teams to prioritize repairs and reduce operating costs. The instrument requires minimal training, making it suitable for preventive maintenance, energy audits, and reliability programs in manufacturing plants, utilities, and commercial facilities.','Parameter	    Specification
Instrument Type	    Acoustic Imager
Brand	            Fluke
Model	            ii500
Serial Number  	    ACF14
Acoustic Sensors    MEMS Microphone Array
Frequency Range	    2 kHz to 52 kHz
Detection Distance  0.5 m to >50 m
Display	            7-inch Color LCD Touchscreen
Display Resolution  1280 × 800 Pixels
Camera Resolution   0.3 MP Visible Camera
Image Storage	    20 GB Internal Memory
Image Format	    JPG / PNG
Video Format	    MP4
Communication	    USB-C
Battery	            Rechargeable Lithium-ion Battery
Battery Life	    Approximately 6 Hours
Protection Class	IP40
Operating Temperature	0°C to +40°C','Acoustic Sound Level, 
Ultrasonic Sound Intensity, 
Sound Pressure Level (dB SPL), 
Acoustic Frequency, 
Compressed Air Leak Detection, 
Gas Leak Detection, 
Vacuum Leak Detection, 
Steam Leak Detection, 
Leak Severity (LeakQ™), 
Relative Leak Size, 
Estimated Energy Loss, 
Estimated Leak Cost, 
Acoustic Image (SoundMap™), 
Image Capture, 
Video Recording, 
Inspection Distance, 
Signal Strength.','Sound Pressure Level	±1 dB SPL (Typical, frequency dependent), Leak Detection	High sensitivity using LeakQ™,  Leak Localization	High precision acoustic imaging , Repeatability	±1% Typical , Image Alignment	Automatic SoundMap™ Overlay.','Frequency	2 kHz to 52 kHz , Detection Distance	0.5 m to >50 m ,Sound Pressure Level	Approximately 15.4 dB SPL to 133 dB SPL (Frequency dependent) , Image Storage	>5000 , Images Video Storage	>999 Videos , Video Recording	Up to 5 Minutes per Recording.','Sound Level	0.1 dB,  Frequency	1 kHz , Image Resolution	0.3 MP,  Display Resolution	1280 × 800 Pixels , Time	1 Second , Video	HD Recording.','Compressed Air Leak Detection
Gas Leak Inspection
Steam Leak Detection
Vacuum Leak Detection
Industrial Energy Audits
Predictive Maintenance
Preventive Maintenance Programs
Manufacturing Plants
Chemical Industries
Food Processing Industries
Pharmaceutical Plants
Automotive Manufacturing
Compressor System Inspection
Pneumatic System Maintenance
Utility Maintenance
Reliability-Centered Maintenance (RCM)
Plant Energy Conservation Programs
Industrial Safety Inspections
Maintenance Cost Reduction
Equipment Condition Monitoring','Inspect the acoustic imager for physical damage before use.
Verify that the battery is fully charged.
Ensure the instrument has a valid calibration certificate.
Press the power button to switch ON the instrument.
Select LeakQ™ Mode for leak detection.
Adjust the frequency range if required.
Hold the instrument approximately 0.5–10 meters from the equipment being inspected.
Slowly scan the area while observing the SoundMap™ displayed on the screen.
Identify the leak location indicated by the acoustic image.
Capture images or videos of the detected leak.
Record inspection notes if required.
Save all inspection data in the internal memory.
Transfer the inspection data to a computer using the USB-C interface.
Switch OFF the instrument after completing the inspection.
Clean the instrument and store it in its protective carrying case.','Inspect the microphone array, display, camera lens, and housing.
Clean the microphone openings using the recommended cleaning method.
Verify battery condition.
Connect the instrument to an authorized calibration or functional verification system.
Verify microphone sensitivity using a certified acoustic reference source.
Check frequency response across the operating frequency range.
Verify SoundMap™ image alignment.
Perform LeakQ™ functional verification.
Verify image capture and video recording functions.
Verify USB-C communication and data transfer.
Update firmware if recommended by the manufacturer.
Perform final operational verification.
Generate a calibration or verification certificate.
Affix a calibration label indicating the calibration and next due dates.
Record calibration details in the instrument maintenance log.

Recommended Calibration Interval: Every 12 months.','Read the operating manual before using the instrument.
Only trained personnel should perform inspections.
Wear appropriate Personal Protective Equipment (PPE).
Maintain a safe distance from energized equipment.
Never touch moving machinery during inspection.
Do not use the instrument in explosive atmospheres unless approved.
Keep the microphone array free from dust and debris.
Avoid dropping or subjecting the instrument to mechanical shock.
Protect the display and camera lens from scratches.
Use only genuine Fluke batteries and chargers.
Recharge the battery using the approved charger only.
Back up inspection data regularly.
Store the instrument in a clean, dry, and dust-free environment.
Perform annual calibration and firmware updates as recommended.
Follow all plant safety procedures and Lockout/Tagout (LOTO) practices during inspections.','https://drive.google.com/file/d/19C2UvYthFPEPU-eb851_ioxMEfi6ojdR/view?usp=drive_link','https://youtu.be/5qVhg5atfDQ?si=wYuQmNbbWf17GVFz',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('L-pOzDRY','available','warehouse','Flue Gas Analyzer','Flue Gas Analyzer','Kane','958','FGK15','2026-05-25T05:31:03.500Z','2026-10-06T05:31:03.500Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTQO7lm3OHvhywAKUmXwnAU2ePZHvsjt_4uLo-Tzek-mQ&s=10"]'::jsonb,'The Kane 958 Flue Gas Analyzer is a professional portable combustion analyzer designed for measuring flue gas emissions and evaluating combustion efficiency in boilers, furnaces, ovens, heaters, and industrial combustion systems. It provides fast and accurate measurement of oxygen (O₂), carbon monoxide (CO), carbon dioxide (CO₂), combustion efficiency, excess air, flue temperature, differential pressure, and optional gases such as NO, NO₂, and SO₂. The analyzer is widely used for energy audits, boiler tuning, emissions monitoring, preventive maintenance, and environmental compliance. It features a color display, rechargeable battery, internal memory, and data logging for detailed combustion analysis.','Parameter	     Specification
Instrument Type	     Portable Flue Gas Analyzer
Brand	             Kane
Model	             958
Serial Number	     FGK15
Display	             Color Graphic LCD
Gas Sensors	     Electrochemical Sensors
Data Storage	     Internal Memory
Communication	     USB
Data Logging	     Yes
Power Supply	     Rechargeable Lithium-ion Battery
Probe	             Heated Flue Gas Sampling Probe
Differential Pressure	±160 mbar
Operating Temperature	0°C to +50°C
Storage Temperature	-20°C to +60°C
Protection Class	IP42','Oxygen (O₂),
Carbon Monoxide (CO),
Carbon Dioxide (CO₂) (Calculated), 
Nitric Oxide (NO) (Optional), 
Nitrogen Dioxide (NO₂) (Optional), 
Sulfur Dioxide (SO₂) (Optional), 
Flue Gas Temperature, 
Ambient Temperature, 
Differential Temperature, 
Differential Pressure, 
Draft Pressure, 
Combustion Efficiency, 
Excess Air, 
CO/CO₂ Ratio, 
Stack Loss, 
Fuel Type Selection, 
Gas Velocity (Optional), 
Data Logging.','Oxygen (O₂)	±0.2% Vol,  Carbon Monoxide (CO)	±5 ppm or ±5% of reading,  Temperature	±1°C,  Differential Pressure	±1% Full Scale,  Combustion Efficiency	±1% , Repeatability	±1% of reading.','Oxygen (O₂)	0–21% Vol , Carbon Monoxide (CO)	0–10,000 ppm,  Carbon Dioxide (CO₂)	0–20% (Calculated),  Nitric Oxide (NO)	0–5,000 ppm (Optional),  Nitrogen Dioxide (NO₂)	0–1,000 ppm (Optional) , Sulfur Dioxide (SO₂)	0–5,000 ppm (Optional) , Flue Temperature	-20°C to +600°C , Differential Pressure	-160 to +160 mbar , Combustion Efficiency	0–100%.','Oxygen	0.1%,  Carbon Monoxide	1 ppm,  Carbon Dioxide	0.1% , Temperature	 0.1°C , Pressure	0.1 mbar , Combustion Efficiency	0.1%.','Industrial Energy Audits
Boiler Efficiency Testing
Furnace Performance Analysis
Steam Boiler Commissioning
Combustion Optimization
Stack Emission Monitoring
Industrial Burner Tuning
Power Plant Maintenance
HVAC Boiler Inspection
Environmental Compliance Testing
Cement Industry
Textile Industry
Food Processing Plants
Chemical Industries
Preventive Maintenance Programs','Inspect the analyzer, sampling probe, hoses, and water trap for any physical damage.
Ensure the instrument has a valid calibration certificate.
Charge the battery fully before use.
Switch ON the analyzer and allow the automatic fresh-air zero calibration to complete.
Select the appropriate fuel type from the instrument menu.
Insert the sampling probe into the flue gas sampling port.
Ensure the probe tip is positioned at the center of the flue for representative sampling.
Allow the readings to stabilize.
Record oxygen, carbon monoxide, carbon dioxide, flue temperature, combustion efficiency, and excess air values.
Save the measurement data in the internal memory if required.
Remove the probe carefully after completing the measurements.
Allow the analyzer to purge with fresh air before switching OFF.
Clean the probe and empty the water trap if necessary.
Store the analyzer in its protective carrying case.','Inspect the analyzer, probe, sampling hose, and filters.
Clean or replace the particulate and moisture filters if necessary.
Perform fresh-air zero calibration.
Connect certified calibration gases to the analyzer.
Verify oxygen sensor accuracy.
Verify carbon monoxide sensor accuracy.
Verify optional gas sensors (NO, NO₂, SO₂) if installed.
Check temperature measurement using a certified temperature calibrator.
Verify differential pressure measurement using a calibrated pressure source.
Perform combustion efficiency verification using reference values.
Adjust sensor calibration if required according to manufacturer procedures.
Perform final functional verification.
Generate a calibration certificate.
Attach a calibration label indicating the calibration and next due dates.
Record all calibration information in the instrument maintenance log.

Recommended Calibration Interval: Every 12 months or according to the manufacturer''s service schedule.','Read the operating manual before using the analyzer.
Only trained personnel should perform combustion analysis.
Wear appropriate Personal Protective Equipment (PPE).
Ensure adequate ventilation when working around combustion equipment.
Perform fresh-air zero calibration before each test.
Never expose the sensors to concentrations beyond their specified limits.
Keep the sampling probe away from direct flame contact.
Empty the condensate trap regularly to prevent moisture damage.
Replace filters periodically to maintain measurement accuracy.
Do not block the gas exhaust port.
Avoid operating the instrument in explosive atmospheres unless specifically approved.
Recharge the battery only with the manufacturer-approved charger.
Store the analyzer in a clean, dry environment.
Perform annual calibration and sensor verification.
Follow all plant safety procedures and Lockout/Tagout (LOTO) requirements before testing combustion equipment.','https://drive.google.com/file/d/1PizBNx9ybRc_hpdTmOhHm7dEzvQLhBum/view?usp=drive_link','https://youtu.be/RzbI4jMcbiw?si=GHL4h7ntvl1RJOj2',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('E1aL7WDB','available','warehouse','Flue Gas Analyzer','Flue Gas Analyzer','Testo','340','FGT16','2026-05-25T05:31:03.500Z','2026-10-07T05:31:03.500Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSbMdWOf1V5wUT8vXTi7m6UG7724dzKr-HlCoVbAOSaqQ&s=10"]'::jsonb,'The Testo 340 Flue Gas Analyzer is a high-performance portable combustion and emission analyzer designed for industrial boilers, furnaces, burners, engines, turbines, and thermal process equipment. It is capable of measuring oxygen (O₂), carbon monoxide (CO), carbon dioxide (CO₂), nitric oxide (NO), nitrogen dioxide (NO₂), sulfur dioxide (SO₂), hydrogen sulfide (H₂S), and other gases depending on the installed sensors. The analyzer features interchangeable gas sensors, automatic sensor protection, data logging, and a rugged design suitable for demanding industrial environments.

The Testo 340 is widely used for energy audits, combustion efficiency analysis, environmental emission monitoring, preventive maintenance, and industrial process optimization. It provides fast, reliable measurements to improve fuel efficiency, reduce emissions, and ensure compliance with environmental regulations.','Parameter	      Specification
Instrument Type	      Portable Flue Gas Analyzer
Brand	              Testo
Model	              340
Serial Number	      FGT16
Display	              Backlit Graphic LCD
Gas Sensors	      Electrochemical (Interchangeable)
Data Storage	      Internal Memory
Communication	      USB, Bluetooth (Optional)
Data Logging	      Yes
Power Supply	      Rechargeable Lithium-ion Battery
Sampling Probe	      Heated Flue Gas Probe
Differential Pressure ±200 hPa
Protection Class      IP40
Operating Temperature	-5°C to +45°C
Storage Temperature	-20°C to +50°C','Oxygen (O₂),
Carbon Monoxide (CO),
Carbon Dioxide (CO₂) (Calculated),
Nitric Oxide (NO),
Nitrogen Dioxide (NO₂),
Sulfur Dioxide (SO₂),
Hydrogen Sulfide (H₂S) (Optional),
Flue Gas Temperature,
Ambient Temperature,
Differential Temperature,
Differential Pressure,
Draft Pressure,
Combustion Efficiency,
Excess Air,
Stack Loss,
CO/CO₂ Ratio,
Gas Velocity (Optional),
Data Logging.','Oxygen (O₂)	±0.2% Vol ,Carbon Monoxide (CO)	±5 ppm or ±5% of reading, Nitric Oxide (NO)	±5 ppm or ±5% of reading ,Nitrogen Dioxide (NO₂)	±5 ppm or ±5% of reading, Sulfur Dioxide (SO₂)	±10 ppm or ±5% of reading , Temperature	±0.5°C , Differential Pressure	±0.03 hPa,  Combustion Efficiency	±1%.','Oxygen (O₂)	0 to 21% Vol,  Carbon Monoxide (CO)	0 to 10,000 ppm,  Carbon Dioxide (CO₂)	0 to 50% (Calculated),  Nitric Oxide (NO)	0 to 3,000 ppm , Nitrogen Dioxide (NO₂)	0 to 500 ppm,  Sulfur Dioxide (SO₂)	0 to 5,000 ppm , Hydrogen Sulfide (H₂S)	0 to 500 ppm (Optional) , Flue Gas Temperature	0°C to +1000°C , Differential Pressure	-200 to +200 hPa ,Combustion Efficiency	0 to 120%.','Oxygen	0.1% Vol,  Carbon Monoxide	1 ppm , Carbon Dioxide	0.1%,  Nitric Oxide	1 ppm,  Nitrogen Dioxide	1 ppm , Sulfur Dioxide	1 ppm,  Temperature	0.1°C,  Pressure	0.01 hPa , Combustion Efficiency	0.1%.','Industrial Energy Audits
Boiler Efficiency Analysis
Furnace Combustion Testing
Burner Adjustment and Optimization
Steam Boiler Performance Evaluation
Power Plant Emission Monitoring
Cement Industry
Chemical Processing Plants
Textile Industries
Food Processing Industries
Glass Manufacturing
Metal Processing Industries
Environmental Compliance Monitoring
HVAC Combustion System Inspection
Preventive Maintenance Programs','Inspect the analyzer, sampling probe, filters, hoses, and connectors for any visible damage.
Verify that the analyzer has a valid calibration certificate.
Fully charge the battery before field operation.
Switch ON the analyzer and allow the automatic fresh-air zero calibration to complete.
Select the appropriate fuel type from the instrument menu.
Connect the sampling probe securely to the analyzer.
Insert the probe into the flue gas sampling port, ensuring the probe tip is positioned in the center of the gas stream.
Allow the gas readings to stabilize.
Record oxygen, carbon monoxide, combustion efficiency, excess air, flue temperature, and other required parameters.
Save the measurement data to the internal memory if required.
Remove the sampling probe carefully after the measurements are completed.
Allow the analyzer to purge with fresh air before switching OFF.
Empty the condensate trap and inspect the filters.
Clean the probe and store the analyzer in its protective carrying case.','Inspect the analyzer, sampling probe, hoses, and filters.
Replace contaminated filters if necessary.
Perform automatic fresh-air zero calibration.
Connect certified calibration gases to the analyzer.
Verify oxygen sensor response.
Verify carbon monoxide sensor accuracy.
Verify NO, NO₂, SO₂, and H₂S sensors (if installed).
Verify temperature measurement using a calibrated temperature source.
Verify differential pressure using a traceable pressure calibrator.
Check combustion efficiency calculations using reference values.
Adjust sensor calibration if required according to manufacturer procedures.
Perform complete functional verification.
Generate a calibration certificate.
Attach a calibration label showing the calibration date and due date.
Record calibration details in the instrument maintenance log.

Recommended Calibration Interval: Every 12 months or as specified by the manufacturer.','Read the operating manual before operating the analyzer.
Only trained personnel should perform combustion and emission testing.
Wear appropriate Personal Protective Equipment (PPE), including safety glasses, gloves, and protective footwear.
Ensure adequate ventilation while testing combustion equipment.
Perform fresh-air zero calibration before every measurement.
Never expose gas sensors to concentrations exceeding the specified measurement limits.
Keep the sampling probe away from direct flame contact.
Empty the condensate trap regularly to prevent moisture from entering the analyzer.
Replace sampling filters when contaminated.
Do not block the analyzer exhaust port.
Avoid using the instrument in explosive atmospheres unless specifically certified.
Recharge the battery only with the approved charger.
Store the analyzer in a clean, dry, and dust-free environment.
Perform annual calibration and sensor verification to maintain measurement accuracy.
Follow all plant safety procedures and Lockout/Tagout (LOTO) practices before performing combustion analysis.',NULL,'https://youtu.be/JqDJT3c9mLk?si=PIuL_UJBRUWDtDtU',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('zBnM1oGO','available','warehouse','Vane Anemometer','Vane Anemometer','Fluke','925','VAF17','2026-05-25T05:31:03.500Z','2026-10-08T05:31:03.500Z',365,NULL,'["https://www.indonusatekno.com/wp-content/uploads/2024/10/Fluke-925-Vane-Anemometer-3.png"]'::jsonb,'The Fluke 925 Vane Anemometer is a portable handheld instrument designed for accurate measurement of air velocity, air flow volume, and air temperature in HVAC systems, clean rooms, ventilation ducts, industrial processes, and energy audit applications. It features a high-quality vane sensor for stable and repeatable airflow measurements, making it suitable for commissioning, balancing, and troubleshooting ventilation systems.

The Fluke 925 provides simultaneous display of air velocity and temperature, along with minimum, maximum, average, and data hold functions. Its ergonomic design, large backlit LCD, and durable construction make it an ideal instrument for field engineers, HVAC technicians, and energy auditors.','Parameter	      Specification
Instrument Type	      Digital Vane Anemometer
Brand	              Fluke
Model	              925
Serial Number	      VAF17
Sensor Type	      Rotating Vane Sensor
Display	              Dual Backlit LCD
Measurement Functions	Air Velocity, Air Flow, Temperature
Data Hold	      Yes
Min/Max/Average	      Yes
Auto Power-Off	      Yes
Power Supply	      9 V Battery
Operating Temperature	0°C to +50°C
Storage Temperature	-20°C to +60°C
Protection Class	IP40','Air Velocity,
Air Flow Volume (CFM/CMM), 
Air Temperature, 
Average Air Velocity, 
Maximum Air Velocity, 
Minimum Air Velocity, 
Average Air Flow, 
Maximum Air Flow, 
Minimum Air Flow, 
Wind Speed, 
Ambient Temperature, 
Data Hold, 
Min/Max Recording.','Air Velocity	±2% of reading or ±0.1 m/s , Air Flow	Derived from velocity measurement,  Temperature	±1°C , Repeatability	±1% of reading.','Air Velocity	0.40 to 30.00 m/s,  Air Flow	0 to 99,999 CFM/CMM (Calculated) , Temperature	-20°C to +60°C , Wind Speed	0.40 to 30.00 m/s.','Air Velocity	0.01 m/s , Air Flow	1 CFM / 1 CMM , Temperature	0.1°C , Wind Speed	0.01 m/s.','HVAC System Testing
Ventilation System Performance Evaluation
Air Duct Balancing
Clean Room Airflow Measurement
Industrial Energy Audits
Cooling Tower Airflow Measurement
Air Conditioning Commissioning
Building Ventilation Inspection
Laboratory Airflow Testing
Indoor Air Quality Assessment
Fan Performance Testing
Exhaust System Evaluation
Process Air Monitoring
Preventive Maintenance
Building Energy Management','Inspect the vane anemometer and ensure the vane rotates freely.
Verify that the battery is adequately charged and the instrument is within its calibration period.
Switch ON the instrument.
Select the desired measurement mode (Air Velocity, Air Flow, or Temperature).
If measuring air flow, enter the duct dimensions or cross-sectional area.
Position the vane sensor directly in the airflow with the arrow pointing in the direction of air movement.
Hold the instrument steady until the readings stabilize.
Record the air velocity, air flow, and temperature values.
Use the Min/Max or Average functions if required.
Press the Data Hold button to freeze the displayed reading.
Save or manually record the measurement results.
Switch OFF the instrument after completing the measurements.
Clean the vane sensor carefully.
Store the instrument in its protective carrying case.','Inspect the vane sensor and instrument housing for damage.
Clean the vane to remove dust or debris.
Verify battery condition.
Place the instrument in a certified wind tunnel or airflow calibration system.
Apply known reference airflow velocities.
Compare measured values with the certified reference.
Verify airflow calculations using standard duct sizes.
Check temperature measurement using a calibrated temperature source.
Verify Min/Max, Average, and Data Hold functions.
Adjust calibration if required according to manufacturer procedures.
Perform a complete functional verification.
Generate a calibration certificate.
Attach a calibration label showing the calibration and next due dates.
Record calibration information in the instrument maintenance log.

Recommended Calibration Interval: Every 12 months.','Read the operating manual before using the instrument.
Only trained personnel should perform airflow measurements.
Wear appropriate Personal Protective Equipment (PPE) when working in industrial environments.
Ensure the vane rotates freely before use.
Keep fingers and foreign objects away from the rotating vane.
Do not use the instrument near rotating machinery without maintaining a safe distance.
Avoid exposing the instrument to excessive moisture or direct water spray.
Do not exceed the specified operating temperature limits.
Protect the vane sensor from mechanical shock or impact.
Clean the vane only with a soft, dry cloth or compressed air if recommended.
Replace the battery only with the specified type.
Store the instrument in a clean, dry, and dust-free environment.
Perform annual calibration to maintain measurement accuracy.
Follow all site safety regulations while working on HVAC or ventilation systems.
Ensure stable footing when taking measurements at elevated locations.','https://drive.google.com/file/d/1Jm5YFOegm8keY8L-_n8wceJjaKg2cGLV/view?usp=drive_link','https://youtu.be/yMdT89jWk_4?si=L1OjKzEat7qH8Obz',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('Cs7robme','available','warehouse','Vane Anemometer','Vane Anemometer','Fluke','925','VAF18','2026-05-25T05:31:03.500Z','2026-10-09T05:31:03.500Z',365,NULL,'["https://www.indonusatekno.com/wp-content/uploads/2024/10/Fluke-925-Vane-Anemometer-3.png"]'::jsonb,'The Fluke 925 Vane Anemometer is a portable handheld instrument designed for accurate measurement of air velocity, air flow volume, and air temperature in HVAC systems, clean rooms, ventilation ducts, industrial processes, and energy audit applications. It features a high-quality vane sensor for stable and repeatable airflow measurements, making it suitable for commissioning, balancing, and troubleshooting ventilation systems.

The Fluke 925 provides simultaneous display of air velocity and temperature, along with minimum, maximum, average, and data hold functions. Its ergonomic design, large backlit LCD, and durable construction make it an ideal instrument for field engineers, HVAC technicians, and energy auditors.','Parameter	      Specification
Instrument Type	      Digital Vane Anemometer
Brand	              Fluke
Model	              925
Serial Number	      VAF17
Sensor Type	      Rotating Vane Sensor
Display	              Dual Backlit LCD
Measurement Functions	Air Velocity, Air Flow, Temperature
Data Hold	      Yes
Min/Max/Average	      Yes
Auto Power-Off	      Yes
Power Supply	      9 V Battery
Operating Temperature	0°C to +50°C
Storage Temperature	-20°C to +60°C
Protection Class	IP40','Air Velocity,
Air Flow Volume (CFM/CMM), 
Air Temperature, 
Average Air Velocity, 
Maximum Air Velocity, 
Minimum Air Velocity, 
Average Air Flow, 
Maximum Air Flow, 
Minimum Air Flow, 
Wind Speed, 
Ambient Temperature, 
Data Hold, 
Min/Max Recording.','Air Velocity	±2% of reading or ±0.1 m/s , Air Flow	Derived from velocity measurement,  Temperature	±1°C , Repeatability	±1% of reading.','Air Velocity	0.40 to 30.00 m/s,  Air Flow	0 to 99,999 CFM/CMM (Calculated) , Temperature	-20°C to +60°C , Wind Speed	0.40 to 30.00 m/s.','Air Velocity	0.01 m/s , Air Flow	1 CFM / 1 CMM , Temperature	0.1°C , Wind Speed	0.01 m/s.','HVAC System Testing
Ventilation System Performance Evaluation
Air Duct Balancing
Clean Room Airflow Measurement
Industrial Energy Audits
Cooling Tower Airflow Measurement
Air Conditioning Commissioning
Building Ventilation Inspection
Laboratory Airflow Testing
Indoor Air Quality Assessment
Fan Performance Testing
Exhaust System Evaluation
Process Air Monitoring
Preventive Maintenance
Building Energy Management','Inspect the vane anemometer and ensure the vane rotates freely.
Verify that the battery is adequately charged and the instrument is within its calibration period.
Switch ON the instrument.
Select the desired measurement mode (Air Velocity, Air Flow, or Temperature).
If measuring air flow, enter the duct dimensions or cross-sectional area.
Position the vane sensor directly in the airflow with the arrow pointing in the direction of air movement.
Hold the instrument steady until the readings stabilize.
Record the air velocity, air flow, and temperature values.
Use the Min/Max or Average functions if required.
Press the Data Hold button to freeze the displayed reading.
Save or manually record the measurement results.
Switch OFF the instrument after completing the measurements.
Clean the vane sensor carefully.
Store the instrument in its protective carrying case.','Inspect the vane sensor and instrument housing for damage.
Clean the vane to remove dust or debris.
Verify battery condition.
Place the instrument in a certified wind tunnel or airflow calibration system.
Apply known reference airflow velocities.
Compare measured values with the certified reference.
Verify airflow calculations using standard duct sizes.
Check temperature measurement using a calibrated temperature source.
Verify Min/Max, Average, and Data Hold functions.
Adjust calibration if required according to manufacturer procedures.
Perform a complete functional verification.
Generate a calibration certificate.
Attach a calibration label showing the calibration and next due dates.
Record calibration information in the instrument maintenance log.

Recommended Calibration Interval: Every 12 months.','Read the operating manual before using the instrument.
Only trained personnel should perform airflow measurements.
Wear appropriate Personal Protective Equipment (PPE) when working in industrial environments.
Ensure the vane rotates freely before use.
Keep fingers and foreign objects away from the rotating vane.
Do not use the instrument near rotating machinery without maintaining a safe distance.
Avoid exposing the instrument to excessive moisture or direct water spray.
Do not exceed the specified operating temperature limits.
Protect the vane sensor from mechanical shock or impact.
Clean the vane only with a soft, dry cloth or compressed air if recommended.
Replace the battery only with the specified type.
Store the instrument in a clean, dry, and dust-free environment.
Perform annual calibration to maintain measurement accuracy.
Follow all site safety regulations while working on HVAC or ventilation systems.
Ensure stable footing when taking measurements at elevated locations.','https://drive.google.com/file/d/1Jm5YFOegm8keY8L-_n8wceJjaKg2cGLV/view?usp=drive_link','https://youtu.be/yMdT89jWk_4?si=L1OjKzEat7qH8Obz',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('WWNf9wXO','available','warehouse','Temperature Logger','Temperature Logger','Testo','176T4','TLT19','2026-05-25T05:31:03.500Z','2026-10-10T05:31:03.500Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSx7bT5rfnJlsKMTy07q6MoucATIME6fGYeEKbZiqTLSg&s=10"]'::jsonb,'The Testo 176 T4 Temperature Logger is a professional four-channel temperature data logger designed for long-term monitoring and recording of temperatures in industrial processes, laboratories, warehouses, cold storage facilities, HVAC systems, food processing plants, pharmaceutical industries, and energy audit applications. It supports Type K, Type T, Type J, and Type S thermocouples, allowing a wide temperature measurement range and high flexibility for different industrial applications.

The Testo 176 T4 features a large display, high-capacity internal memory capable of storing up to 2 million measurement values, USB connectivity, optional SD card support, and long battery life. The logger ensures reliable and continuous temperature monitoring for preventive maintenance, quality assurance, and regulatory compliance.','Parameter	        Specification
Instrument Type	        Multi-Channel Temperature Data Logger
Brand	                Testo
Model	                176 T4
Serial Number	        TLT19
Measurement Channels	4 Thermocouple Inputs
Thermocouple Types	K, T, J, S
Display	                Large LCD
Memory Capacity	        2,000,000 Measurement Values
Data Logging	        Yes
Communication	        USB, SD Card
Logging Interval	1 second to 24 hours
Power Supply	        Lithium Battery
Battery Life	        Up to 8 Years (Typical)
Protection Class	IP65
Operating Temperature	-20°C to +70°C
Storage Temperature	-40°C to +85°C','Temperature (Channel 1), 
Temperature (Channel 2), 
Temperature (Channel 3), 
Temperature (Channel 4), 
Maximum Temperature, 
Minimum Temperature, 
Average Temperature, 
Temperature Difference, 
Date and Time, 
Data Logging Interval, 
Recording Duration, 
Battery Status, 
Memory Status.','Type K Thermocouple	±0.3°C (Instrument Accuracy) , Type T Thermocouple	±0.3°C , Type J Thermocouple	±0.3°C , Type S Thermocouple	±0.5°C,  Internal Time Clock	±1 Minute per Year.','Type K Thermocouple	-200°C to +1370°C , Type T Thermocouple	-200°C to +400°C,  Type J Thermocouple	-100°C to +750°C , Type S Thermocouple	0°C to +1760°C , Logging Interval	1 Second to 24 Hours , Memory	2 Million Readings.','Temperature	0.1°C,  Time	1 Second , Logging Interval	1 Second , Memory	1 Reading.','Industrial Temperature Monitoring
Boiler Temperature Monitoring
Furnace Temperature Recording
Heat Treatment Processes
Cold Storage Monitoring
Pharmaceutical Storage Validation
Food Processing Industries
HVAC Performance Monitoring
Textile Industries
Cement Plants
Chemical Industries
Laboratory Temperature Recording
Preventive Maintenance Programs
Energy Audit Studies
Quality Assurance and Regulatory Compliance','Inspect the temperature logger, thermocouple connectors, and cables for any visible damage.
Verify that the instrument has a valid calibration certificate.
Install or verify the battery condition.
Connect the required thermocouple sensors to the appropriate input channels.
Switch ON the temperature logger.
Configure the thermocouple type (K, T, J, or S) for each channel.
Set the desired logging interval and recording duration.
Place the thermocouple sensors at the required measurement locations.
Start the data logging process.
Monitor the temperature readings on the display.
Stop logging after the required monitoring period.
Transfer the recorded data to a computer using the USB interface or SD card.
Review and save the recorded data using Testo software.
Disconnect the thermocouples carefully.
Clean the instrument and store it in its protective carrying case.','Inspect the logger, connectors, and thermocouple inputs.
Clean the instrument and inspect for physical damage.
Verify battery condition.
Connect certified thermocouple simulators or reference temperature sources.
Apply known temperature values at multiple calibration points.
Verify each channel independently.
Compare measured values with certified reference standards.
Verify time and date accuracy.
Test memory and data logging functions.
Adjust calibration parameters if required using manufacturer-approved software.
Perform a complete functional verification.
Generate a calibration certificate.
Affix a calibration label indicating the calibration date and due date.
Record calibration details in the instrument maintenance log.

Recommended Calibration Interval: Every 12 months.','Read the operating manual before using the temperature logger.
Only trained personnel should perform temperature measurements.
Wear appropriate Personal Protective Equipment (PPE) when working with hot or cold processes.
Verify that the selected thermocouple type is suitable for the expected temperature range.
Avoid exceeding the maximum temperature rating of the thermocouple sensors.
Do not expose the instrument to water unless proper protection is provided.
Ensure all thermocouple connections are secure before logging data.
Keep thermocouple wires away from moving machinery and high-voltage conductors.
Handle hot thermocouple probes carefully to prevent burns.
Replace the battery only with the recommended type.
Back up recorded data regularly before clearing the memory.
Clean the instrument using a soft, dry cloth only.
Store the logger in a clean, dry, and dust-free environment.
Perform annual calibration to maintain measurement accuracy and traceability.
Follow all site safety procedures while working in industrial environments.','https://drive.google.com/file/d/1OsOkSIQqUtgep9s7wr8LtUgzF4RnNvc-/view?usp=drive_link','https://youtu.be/uujwQBrm91s?si=Zx2IocI4qaR9efzb',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('DyD7G5T1','available','warehouse','Lux Meter','Lux Meter','Fluke','941','LXF20','2026-05-25T05:31:03.500Z','2026-10-11T05:31:03.500Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQP5QpUtEsC-qGtC0N0xiwqp6yVIV3FvVbGMw98SQlP6A&s=10"]'::jsonb,'The Fluke 941 Lux Meter is a portable digital light meter designed for accurate measurement of illuminance (lux and foot-candle) in industrial, commercial, and residential environments. It features a high-sensitivity silicon photodiode sensor with a cosine-corrected diffuser, ensuring reliable measurements that closely match the human eye''s response to light.

The Fluke 941 is widely used for lighting audits, workplace illumination assessments, HVAC inspections, clean room validation, educational institutions, hospitals, warehouses, manufacturing plants, and energy audits. The instrument provides fast response, auto-ranging capability, minimum/maximum recording, data hold, and a large LCD display for easy field operation.','Parameter	       Specification
Instrument Type	       Digital Lux Meter
Brand	               Fluke
Model	               941
Serial Number	       LXF20
Sensor Type	       Silicon Photodiode with Cosine Correction
Measurement Units	Lux (lx), Foot-candle (fc)
Display	               Large LCD
Auto Range	       Yes
Data Hold	       Yes
Min/Max Recording	Yes
Auto Power-Off	        Yes
Power Supply	        9V Battery
Operating Temperature	0°C to +40°C
Storage Temperature	-10°C to +60°C
Protection Class	IP40','Illuminance (Lux), 
Illuminance (Foot-candle), 
Maximum Light Intensity, 
Minimum Light Intensity, 
Average Light Intensity, 
Relative Light Measurement, 
Data Hold, 
Battery Status, 
Auto Range Status.','Illuminance	±3% of reading ±0.5% full scale (Standard Calibration) ,  Cosine Correction-	Meets CIE Standards , Repeatability	±1% of reading.','Illuminance	0.1 to 200,000 lux,  Foot-candle	0.01 to 20,000 fc , Display Overrange	Above Maximum Measurement Range.','Illuminance	0.1 lux,  Foot-candle	0.01 fc,  Display	4 Digits.','Industrial Lighting Audits
Office Lighting Assessment
Factory Illumination Measurement
Warehouse Lighting Inspection
Hospital Lighting Verification
School and University Lighting Surveys
Clean Room Validation
Laboratory Lighting Measurement
HVAC System Commissioning
Building Energy Audits
Street Lighting Evaluation
Sports Facility Lighting
Emergency Lighting Testing
Occupational Safety Assessments
Preventive Maintenance Programs','Inspect the lux meter and light sensor for any visible damage.
Verify that the instrument has a valid calibration certificate.
Ensure the battery has sufficient charge.
Switch ON the instrument.
Remove the protective cap from the light sensor.
Select the desired measurement unit (Lux or Foot-candle).
Place the sensor at the location where the light level is to be measured.
Hold the sensor horizontally with the sensing surface facing the light source.
Avoid casting shadows on the sensor during measurement.
Allow the reading to stabilize.
Record the measured light intensity.
Use the Data Hold or Min/Max functions if required.
Replace the protective cap after completing the measurement.
Switch OFF the instrument.
Store the lux meter in its protective carrying case.','Inspect the instrument and clean the light sensor using a lint-free cloth.
Verify battery condition.
Place the lux meter in a certified photometric calibration laboratory.
Expose the sensor to a calibrated standard light source.
Compare the measured illuminance with the certified reference value.
Verify measurements at multiple illumination levels.
Check cosine correction performance.
Verify linearity across the measurement range.
Test the Data Hold and Min/Max functions.
Adjust calibration if required according to manufacturer procedures.
Perform a complete functional verification.
Generate a calibration certificate.
Attach a calibration label showing the calibration and next due dates.
Record calibration information in the instrument maintenance log.

Recommended Calibration Interval: Every 12 months.','Read the operating manual before using the instrument.
Only trained personnel should perform lighting measurements.
Avoid touching the light sensor surface with bare fingers.
Keep the sensor clean and free from dust, oil, and moisture.
Do not expose the sensor to excessive heat or direct sunlight for prolonged periods.
Protect the instrument from water and high humidity.
Handle the sensor carefully to prevent scratches or mechanical damage.
Replace the protective cap after every measurement.
Replace the battery only with the recommended type.
Store the instrument in a clean, dry, and dust-free environment.
Do not disassemble or modify the instrument.
Perform annual calibration to maintain measurement accuracy.
Follow all workplace safety procedures while conducting lighting surveys.
Keep the instrument away from strong electromagnetic fields that may affect measurements.
Verify the calibration status before critical illumination assessments.','https://drive.google.com/file/d/1TtRFbeofGAHCZzP4VjPO0Lu0lt5G56Cj/view?usp=drive_link','https://youtu.be/UDejbXW-a2w?si=EwOVItGVzgVjyHV_',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('sflZ4rG2','available','warehouse','Lux Meter','Lux Meter','Fluke','941','LXF21','2026-05-25T05:31:03.500Z','2026-10-12T05:31:03.500Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQP5QpUtEsC-qGtC0N0xiwqp6yVIV3FvVbGMw98SQlP6A&s=10"]'::jsonb,'The Fluke 941 Lux Meter is a portable digital light meter designed for accurate measurement of illuminance (lux and foot-candle) in industrial, commercial, and residential environments. It features a high-sensitivity silicon photodiode sensor with a cosine-corrected diffuser, ensuring reliable measurements that closely match the human eye''s response to light.

The Fluke 941 is widely used for lighting audits, workplace illumination assessments, HVAC inspections, clean room validation, educational institutions, hospitals, warehouses, manufacturing plants, and energy audits. The instrument provides fast response, auto-ranging capability, minimum/maximum recording, data hold, and a large LCD display for easy field operation.','Parameter	       Specification
Instrument Type	       Digital Lux Meter
Brand	               Fluke
Model	               941
Serial Number	       LXF20
Sensor Type	       Silicon Photodiode with Cosine Correction
Measurement Units	Lux (lx), Foot-candle (fc)
Display	               Large LCD
Auto Range	       Yes
Data Hold	       Yes
Min/Max Recording	Yes
Auto Power-Off	        Yes
Power Supply	        9V Battery
Operating Temperature	0°C to +40°C
Storage Temperature	-10°C to +60°C
Protection Class	IP40','Illuminance (Lux), 
Illuminance (Foot-candle), 
Maximum Light Intensity, 
Minimum Light Intensity, 
Average Light Intensity, 
Relative Light Measurement, 
Data Hold, 
Battery Status, 
Auto Range Status.','Illuminance	±3% of reading ±0.5% full scale (Standard Calibration) ,  Cosine Correction-	Meets CIE Standards , Repeatability	±1% of reading.','Illuminance	0.1 to 200,000 lux,  Foot-candle	0.01 to 20,000 fc , Display Overrange	Above Maximum Measurement Range.','Illuminance	0.1 lux,  Foot-candle	0.01 fc,  Display	4 Digits.','Industrial Lighting Audits
Office Lighting Assessment
Factory Illumination Measurement
Warehouse Lighting Inspection
Hospital Lighting Verification
School and University Lighting Surveys
Clean Room Validation
Laboratory Lighting Measurement
HVAC System Commissioning
Building Energy Audits
Street Lighting Evaluation
Sports Facility Lighting
Emergency Lighting Testing
Occupational Safety Assessments
Preventive Maintenance Programs','Inspect the lux meter and light sensor for any visible damage.
Verify that the instrument has a valid calibration certificate.
Ensure the battery has sufficient charge.
Switch ON the instrument.
Remove the protective cap from the light sensor.
Select the desired measurement unit (Lux or Foot-candle).
Place the sensor at the location where the light level is to be measured.
Hold the sensor horizontally with the sensing surface facing the light source.
Avoid casting shadows on the sensor during measurement.
Allow the reading to stabilize.
Record the measured light intensity.
Use the Data Hold or Min/Max functions if required.
Replace the protective cap after completing the measurement.
Switch OFF the instrument.
Store the lux meter in its protective carrying case.','Inspect the instrument and clean the light sensor using a lint-free cloth.
Verify battery condition.
Place the lux meter in a certified photometric calibration laboratory.
Expose the sensor to a calibrated standard light source.
Compare the measured illuminance with the certified reference value.
Verify measurements at multiple illumination levels.
Check cosine correction performance.
Verify linearity across the measurement range.
Test the Data Hold and Min/Max functions.
Adjust calibration if required according to manufacturer procedures.
Perform a complete functional verification.
Generate a calibration certificate.
Attach a calibration label showing the calibration and next due dates.
Record calibration information in the instrument maintenance log.

Recommended Calibration Interval: Every 12 months.','Read the operating manual before using the instrument.
Only trained personnel should perform lighting measurements.
Avoid touching the light sensor surface with bare fingers.
Keep the sensor clean and free from dust, oil, and moisture.
Do not expose the sensor to excessive heat or direct sunlight for prolonged periods.
Protect the instrument from water and high humidity.
Handle the sensor carefully to prevent scratches or mechanical damage.
Replace the protective cap after every measurement.
Replace the battery only with the recommended type.
Store the instrument in a clean, dry, and dust-free environment.
Do not disassemble or modify the instrument.
Perform annual calibration to maintain measurement accuracy.
Follow all workplace safety procedures while conducting lighting surveys.
Keep the instrument away from strong electromagnetic fields that may affect measurements.
Verify the calibration status before critical illumination assessments.','https://drive.google.com/file/d/1TtRFbeofGAHCZzP4VjPO0Lu0lt5G56Cj/view?usp=drive_link','https://youtu.be/UDejbXW-a2w?si=EwOVItGVzgVjyHV_',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('3Ah5FKz9','available','warehouse','Steam Trap Tester','Steam Trap Tester','UE Systems','100-UP','STU22','2026-05-25T05:31:03.500Z','2026-10-13T05:31:03.500Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ7gspvRM59pS7KWjPj2T812AQoDJ1ZEStEC2gtQ98SeuZcP2bwr1g6EQY&s=10"]'::jsonb,'The UE Systems Ultraprobe 100-UP Steam Trap Tester is a portable ultrasonic inspection instrument designed for evaluating the condition and performance of steam traps, compressed air systems, valves, bearings, and mechanical equipment. It detects high-frequency ultrasonic sound generated by leaking steam, gas, or mechanical friction and converts it into audible sound through headphones while displaying the signal intensity on the instrument.

The Ultraprobe 100 is widely used in steam system maintenance, energy audits, predictive maintenance, reliability engineering, compressed air leak detection, and mechanical inspections. By identifying failed or leaking steam traps, the instrument helps industries reduce steam losses, improve boiler efficiency, conserve energy, and minimize maintenance costs.','Parameter	        Specification
Instrument Type	        Ultrasonic Steam Trap Tester
Brand	                UE Systems
Model	                100-UP (Ultraprobe 100)
Serial Number	        STU22
Measurement Principle	Airborne & Structure-borne Ultrasonic Detection
Sensor Type	        Piezoelectric Ultrasonic Sensor
Frequency	        Fixed 40 kHz
Display	                10-Segment LED Bar Graph
Audio Output	        Headphones
Sensitivity Adjustment	Rotary Control
Power Supply	        9 V Alkaline Battery
Battery Life	        Approximately 30 Hours
Operating Temperature	0°C to +50°C
Storage Temperature	-20°C to +60°C
Protection Class	IP54','Ultrasonic Sound Level, 
Steam Trap Leakage, 
Steam Trap Operation, 
Steam Flow Noise, 
Valve Leakage, 
Compressed Air Leakage, 
Gas Leakage, 
Vacuum Leakage, 
Bearing Noise, 
Mechanical Friction, 
Cavitation, 
Electrical Arcing, 
Corona Discharge, 
Tracking Discharge, 
Relative Ultrasonic Signal Strength.','Ultrasonic Detection	High Sensitivity at 40 kHz , Signal Repeatability	±1 dB Typical , Relative Signal Measurement	±2% of Reading,  Leak Detection	High Sensitivity.','Ultrasonic Frequency	40 kHz, Detection Distance	Up to 15 m (Application Dependent),  Sensitivity Adjustment	-Continuously Variable,  Audio Output	Adjustable Volume , LED Display	0 to 10 Relative Signal Levels.','Ultrasonic Signal	1 LED Segment , Audio Response	-Continuous ,  Sensitivity Adjustment	Fine Variable Control.','Steam Trap Inspection
Steam Leakage Detection
Steam Distribution System Maintenance
Boiler House Energy Audits
Compressed Air Leak Detection
Gas Leak Detection
Valve Leakage Inspection
Bearing Condition Monitoring
Pump Condition Monitoring
Motor Bearing Inspection
Predictive Maintenance Programs
Mechanical Equipment Troubleshooting
Electrical Discharge Detection
Industrial Energy Conservation
Reliability-Centered Maintenance (RCM)','Inspect the instrument, sensor module, headphones, and battery condition.
Verify that the instrument has a valid calibration certificate.
Install or verify the battery condition.
Connect the headphones securely.
Switch ON the instrument.
Adjust the sensitivity control to an appropriate level.
Place the contact probe on the steam trap body or point the airborne sensor toward the inspection area.
Listen to the ultrasonic signal through the headphones.
Observe the LED bar graph indicating signal intensity.
Compare the ultrasonic signal with the expected operating condition of the steam trap.
Record the inspection results.
Repeat the procedure for all steam traps or equipment.
Switch OFF the instrument after completing the inspection.
Clean the probe and store the instrument in its protective carrying case.','Inspect the instrument, probe, headphones, and housing.
Clean the contact probe and airborne sensor.
Verify battery voltage.
Connect the instrument to a certified ultrasonic reference source.
Verify ultrasonic sensor sensitivity at 40 kHz.
Check LED bar graph response.
Verify audio output using reference ultrasonic signals.
Test sensitivity adjustment across the full range.
Perform repeatability verification.
Adjust calibration if required according to manufacturer procedures.
Perform complete functional testing.
Generate a calibration certificate.
Attach a calibration label indicating the calibration date and next due date.
Record calibration information in the instrument maintenance log.

Recommended Calibration Interval: Every 12 months.','Read the operating manual before using the instrument.
Only trained personnel should inspect steam systems.
Wear appropriate Personal Protective Equipment (PPE), including heat-resistant gloves, safety glasses, and protective footwear.
Exercise caution when working near hot steam pipes and steam traps.
Never touch exposed hot surfaces without proper protection.
Verify safe access to the inspection point before beginning measurements.
Keep the contact probe away from moving machinery.
Do not use the instrument in explosive atmospheres unless it is certified for such environments.
Replace the battery only with the recommended type.
Clean the sensor and probe after each inspection.
Store the instrument in a clean, dry, and dust-free environment.
Perform annual calibration to maintain measurement accuracy.
Follow Lockout/Tagout (LOTO) procedures whenever maintenance activities require equipment isolation.
Report any defective steam traps immediately to prevent energy losses and safety hazards.
Always maintain a safe distance from high-pressure steam leaks, as they may be invisible and extremely hazardous.','https://drive.google.com/file/d/1TPMBtUeG1E6gVhsdBSPA-GquEl2NW3xB/view?usp=drive_link','https://youtu.be/c-CjeRCxyJk?si=zGaj6gwo14lYGssN',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('DHBy1cBN','available','warehouse','Digital Tachometer','Digital Tachometer','Fluke','931','DTF23','2026-05-25T05:31:03.500Z','2026-10-14T05:31:03.500Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ9XkhKKgWhv-STnMLI10qzqZ1uyy3GhLfmmwjOkUGQrw&s"]'::jsonb,'The Fluke 931 Digital Tachometer is a portable, handheld instrument designed for accurate measurement of rotational speed (RPM) and surface speed of rotating machinery. It supports both contact and non-contact (optical) measurement methods, making it suitable for motors, pumps, fans, compressors, conveyors, turbines, gearboxes, and other rotating equipment.

The instrument uses a laser beam and reflective tape for non-contact RPM measurements, while contact adapters allow direct measurement of rotational and linear speeds. The Fluke 931 features a large backlit LCD display, memory function, minimum/maximum/average recording, and automatic data hold. It is widely used in predictive maintenance, energy audits, machine diagnostics, and industrial equipment commissioning.','Parameter	       Specification
Instrument Type	       Digital Contact / Non-Contact Tachometer
Brand	               Fluke
Model	               931
Serial Number	        DTF23
Measurement Method	Optical (Laser) & Contact
Laser Type	        Class II Laser
Display	                5-digit LCD
Memory Function	        Last, Minimum, Maximum, Average
Data Hold	        Yes
Auto Power-Off	        Yes
Power Supply	        4 × AA Batteries
Operating Temperature	0°C to +50°C
Storage Temperature	-20°C to +70°C
Protection Class	IP40','Rotational Speed (RPM), 
Contact RPM, 
Non-Contact RPM, 
Surface Speed, 
Linear Speed, 
Maximum RPM, 
Minimum RPM, 
Average RPM, 
Frequency of Rotation, 
Data Hold, 
Memory Recall, 
Battery Status.','Optical RPM	±0.02% of reading ±1 digit , Contact RPM	±0.05% of reading ±1 digit , Surface Speed	±0.05% of reading , Repeatability	±0.02% of reading.','Optical RPM	1 to 99,999 RPM , Contact RPM	0.1 to 19,999 RPM , Surface Speed	0.1 to 1,999.9 m/min,  Linear Speed	0.1 to 6,560 ft/min , Measuring Distance (Optical)	50 mm to 500 mm.','Optical RPM	0.1 RPM , Contact RPM	0.1 RPM , Surface Speed	0.1 m/min , Linear Speed	0.1 ft/min.','Motor Speed Measurement
Pump Performance Testing
Fan Speed Verification
Conveyor Belt Speed Measurement
Gearbox Inspection
Turbine Speed Measurement
Compressor Performance Analysis
Preventive Maintenance
Predictive Maintenance Programs
Energy Audits
Industrial Machine Commissioning
Production Equipment Monitoring
Laboratory Equipment Testing
HVAC Equipment Inspection
Manufacturing Plant Maintenance','Inspect the tachometer, laser window, contact adapters, and accessories for any physical damage.
Verify that the instrument has a valid calibration certificate.
Install or verify the battery condition.
Switch ON the tachometer.
Select Optical Mode or Contact Mode depending on the application.
For optical measurements, attach reflective tape to the rotating shaft.
Aim the laser beam at the reflective tape while maintaining the recommended measuring distance.
Allow the displayed RPM value to stabilize.
For contact measurements, install the appropriate contact adapter.
Gently press the adapter against the rotating shaft or wheel.
Record the measured RPM or surface speed.
Use the Min/Max/Average function if required.
Remove the instrument safely after the measurement.
Switch OFF the tachometer.
Clean the instrument and store it in its protective carrying case.','Inspect the instrument, laser window, and contact accessories.
Clean the optical lens using a lint-free cloth.
Verify battery condition.
Connect the tachometer to a certified rotational speed calibration system.
Verify optical RPM measurements using a reference rotating target.
Verify contact RPM measurements using a calibrated rotational speed source.
Check surface speed measurements using certified calibration wheels.
Verify Min/Max/Average memory functions.
Test the Data Hold function.
Adjust calibration if required according to manufacturer procedures.
Perform complete functional verification.
Generate a calibration certificate.
Attach a calibration label showing the calibration date and due date.
Record calibration information in the maintenance log.

Recommended Calibration Interval: Every 12 months.','Read the operating manual before operating the tachometer.
Only trained personnel should perform rotational speed measurements.
Wear appropriate Personal Protective Equipment (PPE), including safety glasses and protective footwear.
Never point the laser beam directly into anyone''s eyes.
Do not look directly into the laser beam or its reflections.
Ensure rotating equipment is properly guarded whenever possible.
Keep hands, clothing, and loose objects away from rotating machinery.
Use the contact adapter carefully to prevent slipping.
Maintain a safe distance when using the optical measurement mode.
Do not exceed the specified measurement limits.
Replace batteries only with the recommended type.
Clean the laser window regularly to maintain measurement accuracy.
Store the instrument in a clean, dry, and dust-free environment.
Perform annual calibration to maintain measurement accuracy and traceability.
Follow all plant safety procedures and Lockout/Tagout (LOTO) requirements when working near rotating equipment.','https://drive.google.com/file/d/1SeOmEfVf37koCVD0FCZ8S1JO_ERLM_Ue/view?usp=drive_link','https://youtu.be/cp8JoCBB_Bw?si=O3HTGpbi46fJfKN0',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('Kdaik81l','available','warehouse','Digital Tachometer','Digital Tachometer','Fluke','931','DTF24','2026-05-25T05:31:03.500Z','2026-10-15T05:31:03.500Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ9XkhKKgWhv-STnMLI10qzqZ1uyy3GhLfmmwjOkUGQrw&s"]'::jsonb,'The Fluke 931 Digital Tachometer is a portable, handheld instrument designed for accurate measurement of rotational speed (RPM) and surface speed of rotating machinery. It supports both contact and non-contact (optical) measurement methods, making it suitable for motors, pumps, fans, compressors, conveyors, turbines, gearboxes, and other rotating equipment.

The instrument uses a laser beam and reflective tape for non-contact RPM measurements, while contact adapters allow direct measurement of rotational and linear speeds. The Fluke 931 features a large backlit LCD display, memory function, minimum/maximum/average recording, and automatic data hold. It is widely used in predictive maintenance, energy audits, machine diagnostics, and industrial equipment commissioning.','Parameter	       Specification
Instrument Type	       Digital Contact / Non-Contact Tachometer
Brand	               Fluke
Model	               931
Serial Number	        DTF23
Measurement Method	Optical (Laser) & Contact
Laser Type	        Class II Laser
Display	                5-digit LCD
Memory Function	        Last, Minimum, Maximum, Average
Data Hold	        Yes
Auto Power-Off	        Yes
Power Supply	        4 × AA Batteries
Operating Temperature	0°C to +50°C
Storage Temperature	-20°C to +70°C
Protection Class	IP40','Rotational Speed (RPM), 
Contact RPM, 
Non-Contact RPM, 
Surface Speed, 
Linear Speed, 
Maximum RPM, 
Minimum RPM, 
Average RPM, 
Frequency of Rotation, 
Data Hold, 
Memory Recall, 
Battery Status.','Optical RPM	±0.02% of reading ±1 digit , Contact RPM	±0.05% of reading ±1 digit , Surface Speed	±0.05% of reading , Repeatability	±0.02% of reading.','Optical RPM	1 to 99,999 RPM , Contact RPM	0.1 to 19,999 RPM , Surface Speed	0.1 to 1,999.9 m/min,  Linear Speed	0.1 to 6,560 ft/min , Measuring Distance (Optical)	50 mm to 500 mm.','Optical RPM	0.1 RPM , Contact RPM	0.1 RPM , Surface Speed	0.1 m/min , Linear Speed	0.1 ft/min.','Motor Speed Measurement
Pump Performance Testing
Fan Speed Verification
Conveyor Belt Speed Measurement
Gearbox Inspection
Turbine Speed Measurement
Compressor Performance Analysis
Preventive Maintenance
Predictive Maintenance Programs
Energy Audits
Industrial Machine Commissioning
Production Equipment Monitoring
Laboratory Equipment Testing
HVAC Equipment Inspection
Manufacturing Plant Maintenance','Inspect the tachometer, laser window, contact adapters, and accessories for any physical damage.
Verify that the instrument has a valid calibration certificate.
Install or verify the battery condition.
Switch ON the tachometer.
Select Optical Mode or Contact Mode depending on the application.
For optical measurements, attach reflective tape to the rotating shaft.
Aim the laser beam at the reflective tape while maintaining the recommended measuring distance.
Allow the displayed RPM value to stabilize.
For contact measurements, install the appropriate contact adapter.
Gently press the adapter against the rotating shaft or wheel.
Record the measured RPM or surface speed.
Use the Min/Max/Average function if required.
Remove the instrument safely after the measurement.
Switch OFF the tachometer.
Clean the instrument and store it in its protective carrying case.','Inspect the instrument, laser window, and contact accessories.
Clean the optical lens using a lint-free cloth.
Verify battery condition.
Connect the tachometer to a certified rotational speed calibration system.
Verify optical RPM measurements using a reference rotating target.
Verify contact RPM measurements using a calibrated rotational speed source.
Check surface speed measurements using certified calibration wheels.
Verify Min/Max/Average memory functions.
Test the Data Hold function.
Adjust calibration if required according to manufacturer procedures.
Perform complete functional verification.
Generate a calibration certificate.
Attach a calibration label showing the calibration date and due date.
Record calibration information in the maintenance log.

Recommended Calibration Interval: Every 12 months.','Read the operating manual before operating the tachometer.
Only trained personnel should perform rotational speed measurements.
Wear appropriate Personal Protective Equipment (PPE), including safety glasses and protective footwear.
Never point the laser beam directly into anyone''s eyes.
Do not look directly into the laser beam or its reflections.
Ensure rotating equipment is properly guarded whenever possible.
Keep hands, clothing, and loose objects away from rotating machinery.
Use the contact adapter carefully to prevent slipping.
Maintain a safe distance when using the optical measurement mode.
Do not exceed the specified measurement limits.
Replace batteries only with the recommended type.
Clean the laser window regularly to maintain measurement accuracy.
Store the instrument in a clean, dry, and dust-free environment.
Perform annual calibration to maintain measurement accuracy and traceability.
Follow all plant safety procedures and Lockout/Tagout (LOTO) requirements when working near rotating equipment.','https://drive.google.com/file/d/1SeOmEfVf37koCVD0FCZ8S1JO_ERLM_Ue/view?usp=drive_link','https://youtu.be/cp8JoCBB_Bw?si=O3HTGpbi46fJfKN0',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('CgIIJ4TS','available','warehouse','Thermal Imager','Thermal Imager','Testo','872','THT25','2026-05-25T05:31:03.500Z','2026-10-16T05:31:03.500Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQMTRun4f_u-6_P0lHk-z7oj42XvxYjI4jwm3rO3Z4gLw&s=10"]'::jsonb,'The Testo 872 Thermal Imager is a professional handheld infrared thermal imaging camera designed for non-contact temperature measurement and thermal inspection of electrical, mechanical, and building systems. It detects infrared radiation emitted by objects and converts it into detailed thermal images (thermograms), enabling users to identify overheating components, insulation defects, moisture intrusion, mechanical wear, and energy losses.

The Testo 872 features a high-resolution infrared detector, integrated digital camera, SuperResolution technology, wireless connectivity, and built-in analysis tools. It is widely used for predictive maintenance, energy audits, electrical inspections, HVAC diagnostics, building inspections, and industrial process monitoring.','Parameter	       Specification
Instrument Type        Handheld Infrared Thermal Imager
Brand	               Testo
Model	               872
Serial Number	       THT25
Detector Resolution	320 × 240 Pixels
SuperResolution	        640 × 480 Pixels
Thermal Sensitivity (NETD)	< 60 mK
Spectral Range	        7.5 to 14 µm
Display	                3.5-inch Color Touchscreen LCD
Visible Camera	        Built-in Digital Camera
Image Storage	        Internal Memory / SD Card
Communication	        USB, Wi-Fi, Bluetooth
Battery	                Rechargeable Lithium-ion
Protection Class	IP54
Operating Temperature	-15°C to +50°C
Storage Temperature	-30°C to +60°C','Surface Temperature, 
Maximum Temperature, 
Minimum Temperature, 
Average Temperature, 
Temperature Difference (ΔT), 
Hot Spot Detection, 
Cold Spot Detection, 
Thermal Image, 
Visible Image, 
Emissivity, 
Reflected Apparent Temperature, 
Relative Humidity (with optional probe), 
Dew Point (with optional probe), 
Moisture Risk, 
Image Analysis, 
Thermal Profile, 
Isotherm Analysis.','Temperature	±2°C or ±2% of reading (whichever is greater) , Thermal Sensitivity	< 60 mK,  Temperature Repeatability	±1% of reading , Image Alignment	-Automatic.','Temperature	-30°C to +650°C , Thermal Sensitivity	< 60 mK,  Emissivity	0.01 to 1.00,  Focus Distance	0.1 m to Infinity , Image Storage	Thousands of Thermal Images.','Temperature	0.1°C , Detector Resolution	320 × 240 Pixels,  SuperResolution	640 × 480 Pixels , Display	High-Resolution LCD,  Time	1 second.','Industrial Energy Audits
Electrical Panel Inspection
Transformer Inspection
Motor Condition Monitoring
Bearing Temperature Monitoring
Switchgear Inspection
HVAC System Diagnostics
Building Envelope Inspection
Insulation Defect Detection
Moisture Detection
Steam System Inspection
Solar Panel Inspection
Mechanical Equipment Monitoring
Preventive Maintenance
Predictive Maintenance Programs','Inspect the thermal imager, lens, battery, and accessories for any visible damage.
Verify that the instrument has a valid calibration certificate.
Fully charge the battery before use.
Switch ON the thermal imager.
Set the appropriate emissivity value based on the material being inspected.
Adjust reflected temperature and other measurement parameters if required.
Focus the camera on the target object.
Capture both thermal and visible images.
Review the thermal image for hot spots, cold spots, or abnormal temperature patterns.
Record maximum, minimum, and average temperature values.
Save the thermal images and inspection notes.
Transfer the images to a computer using USB or Wi-Fi for detailed analysis.
Switch OFF the instrument after completing the inspection.
Clean the lens using an approved lens-cleaning cloth.
Store the thermal imager in its protective carrying case.','Inspect the thermal imager, infrared lens, and display.
Clean the infrared lens using a lint-free optical cloth.
Verify battery condition and charging status.
Connect the thermal imager to a certified blackbody calibration source.
Set multiple reference temperatures across the measurement range.
Compare the measured temperatures with the certified blackbody values.
Verify thermal sensitivity (NETD).
Check image alignment between the thermal and visible cameras.
Verify emissivity settings and temperature calculations.
Test image storage, display, and communication functions.
Adjust calibration parameters if required according to the manufacturer''s procedures.
Perform a complete functional verification.
Generate a calibration certificate.
Affix a calibration label indicating the calibration date and next due date.
Record calibration information in the instrument maintenance log.

Recommended Calibration Interval: Every 12 months.','Read the operating manual before operating the thermal imager.
Only trained personnel should perform thermal inspections.
Wear appropriate Personal Protective Equipment (PPE) when inspecting energized electrical equipment.
Maintain the required safe working distance from live electrical systems.
Never touch energized conductors while taking thermal images.
Keep the infrared lens clean and free from fingerprints or dust.
Avoid exposing the camera to direct sunlight for extended periods.
Do not point the camera directly at high-intensity laser sources.
Protect the instrument from severe impacts, excessive vibration, and moisture.
Recharge the battery only with the manufacturer-approved charger.
Back up inspection data regularly.
Store the instrument in a clean, dry, and dust-free environment.
Perform annual calibration to maintain temperature measurement accuracy.
Follow all plant safety procedures and Lockout/Tagout (LOTO) requirements during inspections.
Verify the instrument settings, including emissivity and reflected temperature, before critical measurements','https://drive.google.com/file/d/1vsSoEfXJym7zeOcGP-FUMqr79USYRjUv/view?usp=drive_link','https://youtu.be/g2iEHhfdUEY?si=Mg48sQVxdGnQkOfK',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('6-KTRDkF','available','warehouse','Thermal Imager','Thermal Imager','Testo','883','THT26','2026-05-25T05:31:03.500Z','2026-10-17T05:31:03.500Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQC-RRboB6yBhwLX2NSecC9JuKzZkZDqCuC68krcWL8UA&s=10"]'::jsonb,'The Testo 883 Thermal Imager is a professional high-resolution infrared thermal imaging camera designed for advanced temperature measurement and thermal diagnostics of electrical installations, mechanical equipment, industrial processes, HVAC systems, and building envelopes. It combines a high-performance infrared detector with a built-in digital camera to generate detailed thermal images that help identify overheating components, insulation failures, moisture ingress, energy losses, and equipment faults before failure occurs.

The Testo 883 incorporates SuperResolution technology, wireless connectivity, interchangeable lenses, voice recording, image analysis tools, and integration with Testo IRSoft software. It is widely used for predictive maintenance, preventive maintenance, energy auditing, electrical inspections, condition monitoring, and facility management.','Parameter	         Specification
Instrument Type	         Handheld Infrared Thermal Imager
Brand	                 Testo
Model	                 883
Serial Number	         THT26
Detector Resolution	320 × 240 Pixels
SuperResolution	        640 × 480 Pixels
Thermal Sensitivity (NETD)	< 40 mK
Spectral Range	         7.5 to 14 µm
Display	                 3.5-inch Touchscreen LCD
Visible Camera	         Integrated Digital Camera
Focus	                 Manual / Motorized
Image Storage	         Internal Memory & SD Card
Communication	         USB-C, Wi-Fi, Bluetooth
Battery	                 Rechargeable Lithium-ion
Protection Class	 IP54
Operating Temperature	-15°C to +50°C
Storage Temperature	-30°C to +60°C','Surface Temperature, 
Maximum Temperature, 
Minimum Temperature, 
Average Temperature, 
Temperature Difference (ΔT), 
Hot Spot Detection, 
Cold Spot Detection, 
Thermal Image, 
Digital Image, 
Emissivity, 
Reflected Apparent Temperature, 
Relative Humidity (with optional probe), 
Dew Point, 
Moisture Risk, 
Isotherm Analysis, 
Thermal Profile, 
Temperature Distribution, 
Image Annotation, 
Voice Recording, 
Image Comparison.','Temperature	±2°C or ±2% of reading (whichever is greater),  Thermal Sensitivity	< 40 mK,  Temperature Repeatability	±1% of reading , Image Alignment-	Automatic.','Temperature	-30°C to +650°C , Optional High Temperature Range	Up to +1200°C , Thermal Sensitivity	< 40 mK , Emissivity	0.01 to 1.00,  Focus Distance	0.1 m to Infinity , Image Storage	Thousands of Thermal Images.','Temperature	0.1°C,  Detector Resolution	320 × 240 Pixels , SuperResolution	640 × 480 Pixels,  Display	High-Resolution Touchscreen , Time	1 Second','Industrial Energy Audits
Electrical Distribution Panel Inspection
Transformer Inspection
Motor Temperature Monitoring
Bearing Condition Monitoring
Switchgear Inspection
Busbar Inspection
Mechanical Equipment Diagnostics
HVAC System Performance Evaluation
Building Envelope Inspection
Roof Leak Detection
Moisture Detection
Steam System Inspection
Solar PV Panel Inspection
Furnace Inspection
Preventive Maintenance
Predictive Maintenance Programs
Reliability-Centered Maintenance (RCM)
Industrial Process Monitoring
Facility Asset Management','Inspect the thermal imager, infrared lens, battery, and accessories for any visible damage.
Verify that the instrument has a valid calibration certificate.
Fully charge the battery before field operation.
Switch ON the thermal imager.
Configure the emissivity value according to the material under inspection.
Set reflected apparent temperature and environmental parameters if required.
Select the appropriate focus mode (manual or motorized).
Aim the camera at the inspection target and achieve proper focus.
Capture both thermal and visible images.
Review the thermal image for abnormal temperature patterns, hot spots, or cold spots.
Record maximum, minimum, average, and differential temperature values.
Save the thermal images, voice notes, and inspection data.
Transfer the recorded data to a computer using USB-C, Wi-Fi, or SD card.
Clean the infrared lens after use.
Store the thermal imager in its protective carrying case.','Inspect the thermal imager, infrared lens, display, and accessories.
Clean the infrared lens using an approved optical cleaning cloth.
Verify battery condition.
Connect the instrument to a certified blackbody temperature calibration source.
Apply multiple certified reference temperatures across the measurement range.
Compare measured temperatures with the reference values.
Verify thermal sensitivity (NETD).
Check image alignment between the infrared and visible cameras.
Verify emissivity correction calculations.
Test image storage, communication, and analysis functions.
Adjust calibration parameters if required according to manufacturer procedures.
Perform complete functional verification.
Generate a calibration certificate.
Attach a calibration label indicating the calibration and due dates.
Record calibration details in the instrument maintenance log.

Recommended Calibration Interval: Every 12 months.','Read the operating manual before using the thermal imager.
Only trained personnel should perform thermal inspections.
Wear appropriate Personal Protective Equipment (PPE) when inspecting energized electrical equipment.
Maintain the required approach distance from live electrical systems.
Never touch energized conductors while taking thermal images.
Verify the correct emissivity setting before critical temperature measurements.
Keep the infrared lens clean and free from fingerprints, dust, and moisture.
Avoid exposing the instrument to excessive heat, direct sunlight, or mechanical shock.
Recharge the battery only with the manufacturer-approved charger.
Back up inspection data regularly.
Do not disassemble or modify the instrument.
Store the thermal imager in a clean, dry, and dust-free environment.
Perform annual calibration to maintain temperature measurement accuracy.
Follow all plant safety procedures and Lockout/Tagout (LOTO) requirements during inspections.
Ensure inspection reports are reviewed and corrective actions are initiated for abnormal temperature conditions.',NULL,'https://youtu.be/8JxzTEPqUPE?si=PZkchhugrXhaMDBr',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('thSA4n1U','available','warehouse','Indoor Air Quality Meter','Indoor Air Quality Meter','Testo','IAQ Meter','IAT27','2026-05-25T05:31:03.500Z','2026-10-18T05:31:03.500Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQN6X3C94-gsj8hOon7Ni3NS4wtTNLOixNfAwv3YhapWw&s=10"]'::jsonb,'The Testo Indoor Air Quality (IAQ) Meter is a professional multifunction environmental measuring instrument designed to assess indoor air quality (IAQ) in commercial buildings, industrial facilities, hospitals, laboratories, educational institutions, and HVAC systems. The instrument simultaneously measures carbon dioxide (CO₂), air temperature, relative humidity, atmospheric pressure, and other environmental parameters to evaluate occupant comfort, ventilation efficiency, and indoor environmental conditions.

The Testo IAQ Meter is widely used during HVAC commissioning, ventilation system balancing, clean room monitoring, energy audits, indoor environmental quality assessments, and preventive maintenance. Its large display, internal data logger, and USB connectivity enable efficient recording and reporting of measurement data.','Parameter	             Specification
Instrument Type	             Indoor Air Quality Meter
Brand	                     Testo
Model	                     IAQ Meter
Serial Number	             IAT27
Display	                     Backlit LCD
CO₂ Sensor Type	             Non-Dispersive Infrared (NDIR)
Humidity Sensor	             Capacitive Humidity Sensor
Temperature Sensor	     NTC Thermistor
Data Logging	             Yes
Internal Memory	             Yes
Communication	             USB
Power Supply	             Rechargeable Lithium-ion Battery
Operating Temperature	     0°C to +50°C
Storage Temperature	     -20°C to +60°C
Protection Class	     IP40','Carbon Dioxide (CO₂), 
Air Temperature, 
Relative Humidity, 
Dew Point, 
Wet Bulb Temperature, 
Atmospheric Pressure, 
Absolute Humidity, 
Enthalpy, 
Air Comfort Index, 
Maximum Value, 
Minimum Value, 
Average Value, 
Data Logging, 
Date and Time, 
Battery Status.','Carbon Dioxide (CO₂)	±(50 ppm + 3% of reading),  Temperature	±0.5°C,  Relative Humidity	±2% RH , Atmospheric Pressure	±3 hPa , Dew Point-	Calculated from Temperature and RH.','Carbon Dioxide (CO₂)	0 to 10,000 ppm , Temperature	-20°C to +70°C , Relative Humidity	0 to 100% RH , Atmospheric Pressure	700 to 1100 hPa , Dew Point	-20°C to +70°C,  Wet Bulb Temperature	0°C to +70°C.','Carbon Dioxide	1 ppm , Temperature	0.1°C , Relative Humidity	0.1% RH,  Atmospheric Pressure	0.1 hPa , Dew Point	0.1°C.','Indoor Air Quality Assessment
HVAC System Performance Evaluation
Ventilation Efficiency Testing
Clean Room Monitoring
Hospital Environmental Monitoring
Laboratory Air Quality Measurement
Office Building Air Quality Surveys
Educational Institution IAQ Assessment
Pharmaceutical Manufacturing
Food Processing Facilities
Commercial Building Energy Audits
Building Commissioning
Green Building Certification
Preventive Maintenance Programs
Occupational Health and Safety Assessments','Inspect the IAQ meter and verify that there is no physical damage.
Ensure the instrument has a valid calibration certificate.
Fully charge the battery before use.
Switch ON the instrument.
Allow the instrument to stabilize for approximately 5–10 minutes before taking measurements.
Select the desired measurement mode.
Place the instrument at the breathing zone or designated measurement location.
Avoid placing the sensor near doors, windows, air vents, or direct sunlight unless specifically evaluating those locations.
Allow readings to stabilize.
Record CO₂ concentration, temperature, humidity, and other environmental parameters.
Save the measurement data using the internal memory if required.
Transfer the recorded data to a computer using the USB interface.
Switch OFF the instrument after completing the measurements.
Clean the instrument exterior.
Store the IAQ meter in its protective carrying case.','Inspect the instrument, sensors, and housing.
Clean the exterior using a soft, lint-free cloth.
Verify battery condition.
Perform fresh-air zero calibration for the CO₂ sensor if recommended by the manufacturer.
Verify the CO₂ sensor using certified calibration gas.
Verify the temperature sensor using a traceable temperature standard.
Verify the humidity sensor using a certified humidity calibration chamber.
Verify atmospheric pressure using a calibrated pressure reference.
Check data logging and memory functions.
Perform complete functional verification.
Adjust calibration parameters if required using manufacturer-approved procedures.
Generate a calibration certificate.
Affix a calibration label indicating the calibration date and due date.
Record calibration information in the instrument maintenance log.

Recommended Calibration Interval: Every 12 months.','Read the operating manual before operating the instrument.
Only trained personnel should perform indoor air quality assessments.
Avoid exposing the sensors to excessive dust, moisture, or chemical vapors.
Allow the instrument to stabilize before recording measurements.
Keep the sensor openings clean and unobstructed.
Do not immerse the instrument in water.
Protect the instrument from mechanical shock and vibration.
Recharge the battery only with the manufacturer-approved charger.
Store the instrument in a clean, dry, and dust-free environment.
Avoid exposing the instrument to extreme temperatures beyond the specified limits.
Perform annual calibration to maintain measurement accuracy.
Verify the CO₂ sensor zero calibration before critical measurements.
Follow workplace safety procedures during environmental monitoring.
Handle the sensors carefully to prevent contamination.
Back up recorded data regularly to prevent data loss.',NULL,'https://youtu.be/4sxU01SNMfQ?si=Mes9VG3YJnNz401O',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;
INSERT INTO public.inventory (id,status,location,category,name,brand,model,serial,last_calibration_date,next_calibration_date,calibration_cycle_days,calibration_certificate_url,product_images,product_overview,specifications,parameters_measured,accuracy,measurement_range,resolution,applications,operating_procedure,calibration_procedure,safety_instructions,user_manual_url,youtube_url,booked_by,next_available_date) VALUES ('-thy5Hfm','available','warehouse','Differential Pressure Logger & Pitot Tube','Differential Pressure Logger & Pitot Tube','Testo','510','DPT28','2026-05-25T05:31:03.500Z','2026-10-19T05:31:03.500Z',365,NULL,'["https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTfYVVw-QllopkeBRk8L9jvYNWklhskLjCx0z8HXscDWDYvqYJG74coQWzn&s=10"]'::jsonb,'The Testo 510 Differential Pressure Meter used with a Pitot Tube is a portable instrument designed for measuring differential pressure, air velocity, and air flow in HVAC systems, ventilation ducts, clean rooms, industrial exhaust systems, and process applications. The instrument utilizes a high-precision pressure sensor to measure pressure differences, while the Pitot tube converts the differential pressure into air velocity based on Bernoulli''s Principle.

The Testo 510 is widely used for HVAC commissioning, duct balancing, ventilation system testing, industrial energy audits, clean room validation, and preventive maintenance. Its compact design, backlit display, magnetic rear panel, and automatic temperature and atmospheric pressure compensation provide reliable and accurate field measurements.','Parameter	             Specification
Instrument Type	             Differential Pressure Meter with Pitot Tube
Brand	                     Testo
Model	                     510
Serial Number	             DPT28
Measurement Principle	     Differential Pressure Sensor
Display	                     Backlit LCD
Measurement Units	     Pa, hPa, mbar, mmH₂O, inH₂O
Data Hold	             Yes
Auto Power-Off	             Yes
Temperature Compensation	Automatic
Atmospheric Pressure Compensation	Automatic
Power Supply	              2 × AAA Batteries
Operating Temperature	      0°C to +50°C
Storage Temperature	      -20°C to +70°C
Protection Class	      IP40','Differential Pressure, 
Static Pressure, 
Dynamic Pressure (Using Pitot Tube), 
Air Velocity, 
Air Flow Rate (Calculated), 
Pressure Difference, 
Maximum Pressure, 
Minimum Pressure, 
Average Pressure, 
Temperature Compensation, 
Atmospheric Pressure Compensation, 
Data Hold, 
Battery Status.','Differential Pressure	±0.03 hPa (±3 Pa) , Air Velocity (with Pitot Tube)	±(0.1 m/s + 1.5% of reading) , Repeatability	±0.5% of reading , Temperature Compensation	Automatic.','Differential Pressure	0 to 100 hPa (0 to 10,000 Pa),  Air Velocity (Pitot Tube)	1 to 100 m/s,  Air Flow	Calculated based on duct dimensions , Temperature Compensation	Automatic.','Differential Pressure	0.01 hPa , Pressure	1 Pa,  Air Velocity	0.1 m/s,  Air Flow	1 m³/h.','HVAC Commissioning
Air Duct Balancing
Ventilation System Testing
Clean Room Validation
Industrial Energy Audits
Fan Performance Evaluation
Air Handling Unit (AHU) Testing
Exhaust System Performance Analysis
Dust Collection System Testing
Laboratory Ventilation Measurement
Process Air Monitoring
Building Commissioning
Preventive Maintenance
Industrial Process Monitoring
Occupational Health and Safety Assessments','Inspect the Testo 510, pressure hoses, and Pitot tube for any visible damage.
Verify that the instrument has a valid calibration certificate.
Install fresh batteries or verify battery condition.
Connect the pressure hoses securely to the positive (+) and negative (-) pressure ports.
Connect the Pitot tube to the pressure hoses according to the flow direction.
Switch ON the instrument.
Select the desired measurement unit (Pa, hPa, mbar, etc.).
Zero the differential pressure sensor before measurement.
Insert the Pitot tube into the duct with the tip facing the airflow direction.
Allow the pressure reading to stabilize.
Record the differential pressure and calculated air velocity.
If required, enter duct dimensions to calculate airflow rate.
Save or manually record the measurement results.
Disconnect the pressure hoses and Pitot tube after completing the measurements.
Clean the instrument and store it in its protective carrying case.','Inspect the instrument, pressure ports, hoses, and Pitot tube.
Clean the pressure ports to remove dust or blockages.
Verify battery condition.
Connect the differential pressure meter to a certified pressure calibrator.
Apply known differential pressure values across the measurement range.
Compare the measured readings with certified reference values.
Verify zero adjustment and span accuracy.
Check air velocity calculations using a calibrated airflow reference.
Verify display, Data Hold, and automatic compensation functions.
Adjust calibration if required according to manufacturer procedures.
Perform complete functional verification.
Generate a calibration certificate.
Affix a calibration label indicating the calibration date and due date.
Record calibration details in the instrument maintenance log.

Recommended Calibration Interval: Every 12 months.','Read the operating manual before using the instrument.
Only trained personnel should perform pressure and airflow measurements.
Wear appropriate Personal Protective Equipment (PPE) when working in industrial environments.
Ensure pressure hoses are securely connected before taking measurements.
Zero the instrument before every measurement session.
Insert the Pitot tube carefully to avoid damaging ductwork or equipment.
Do not exceed the instrument''s maximum differential pressure rating.
Avoid using damaged or kinked pressure hoses.
Keep the pressure ports clean and free from dust or moisture.
Do not expose the instrument to water or corrosive chemicals.
Replace batteries only with the recommended type.
Clean the instrument using a soft, dry cloth after use.
Store the instrument in a clean, dry, and dust-free environment.
Perform annual calibration to maintain measurement accuracy and traceability.
Follow all plant safety procedures and Lockout/Tagout (LOTO) requirements while working on HVAC and ventilation systems.','https://drive.google.com/file/d/13-z4d3rS8BhKEkVnyUQfN1Myd0vcB50x/view?usp=drive_link','https://youtu.be/opKCJW8HXG0?si=gu2IFcqFCy1MoH9i',NULL,NULL) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,location=EXCLUDED.location,name=EXCLUDED.name;

-- ============================================================
-- SEED: VENDORS
-- ============================================================
INSERT INTO public.vendors (id,name,company_name,vendor_type,status,contact_person,mobile_number,alternative_mobile_number,email,website,street_address,city,state,country,pin_code,gstin,pan,business_reg_no,remarks) VALUES ('VND-FLK01','Fluke India Pvt Ltd','Fluke Corporation','Manufacturer','Active','Rajesh Kumar','+919876543210','+918877665544','rajesh@fluke.in','www.fluke.com/en-in','102 Industrial Tech Park, Phase 1','Chennai','Tamil Nadu','India','600036','33AAAAA1111A1Z1','AAAAA1111A',NULL,'Preferred manufacturer for high-end diagnostic and power quality analyzers.') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.vendors (id,name,company_name,vendor_type,status,contact_person,mobile_number,alternative_mobile_number,email,website,street_address,city,state,country,pin_code,gstin,pan,business_reg_no,remarks) VALUES ('VND-HIO02','Hioki Instruments Distributor','Hioki EE Corporation','Distributor','Active','Anita Patel','+919988776655',NULL,'anita@hiokipapers.com','www.hioki.com','404 Trade Centre, MG Road','Mumbai','Maharashtra','India','400001','27BBBBB2222B2Z2','BBBBB2222B',NULL,'Primary source for clamp meters and logger probes.') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.vendors (id,name,company_name,vendor_type,status,contact_person,mobile_number,alternative_mobile_number,email,website,street_address,city,state,country,pin_code,gstin,pan,business_reg_no,remarks) VALUES ('VNDOMEWJ','Mathu','mathu industrys','Manufacturer','Active','mathu','9788681455','9788681456','iitmadmin@iit.com',NULL,'123','Chennai','Tamil Nadu','India',NULL,'27AAPFU0939F1ZV',NULL,NULL,'ABC') ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- SEED: UTILITIES
-- ============================================================
INSERT INTO public.utilities (id,name) VALUES ('boiler','Boiler') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.utilities (id,name) VALUES ('compressor','Compressor') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.utilities (id,name) VALUES ('chiller','Chiller') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.utilities (id,name) VALUES ('motor','Motor') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.utilities (id,name) VALUES ('pump','Pump') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.utilities (id,name) VALUES ('hvac','HVAC') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.utilities (id,name) VALUES ('lighting','Lighting') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.utilities (id,name) VALUES ('air compressor','Air Compressor') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.utilities (id,name) VALUES ('transformer','Transformer') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.utilities (id,name) VALUES ('cooling tower','Cooling Tower') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.utilities (id,name) VALUES ('power quality','Power Quality') ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- SEED: PRODUCTS
-- ============================================================
INSERT INTO public.products (id,vendor_id,name,description,category,brand,product_status,utility_name) VALUES ('PRD-FL001','VND-FLK01','Power Quality Analyzer Probe','Flexible current probe for Fluke 1775.','Accessories','Fluke','Active','Transformer') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id,vendor_id,name,description,category,brand,product_status,utility_name) VALUES ('PRD-HI002','VND-HIO02','Hioki Clamp Logger Sensor','AC/DC Current sensor for power loggers.','Sensors','Hioki','Active','Motor') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.products (id,vendor_id,name,description,category,brand,product_status,utility_name) VALUES ('PRDMWDDO','VNDOMEWJ','Capacitor','To improve the power factor','Component','Mathu','Active','Power Quality') ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- SEED: BOOKINGS (purchase_orders)
-- ============================================================


