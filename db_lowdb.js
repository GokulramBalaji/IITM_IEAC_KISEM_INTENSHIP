const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const path = require('path');
const { nanoid } = require('nanoid');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'IITM_IEAS_KISEM_SECURE_KEY_2026_!'; // Must be 32 bytes
const IV_LENGTH = 16;

function encrypt(text) {
  if (!text) return text;
  try {
    let iv = crypto.randomBytes(IV_LENGTH);
    let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.substring(0, 32)), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (e) {
    console.error('Encryption failed', e);
    return text;
  }
}

function decrypt(text) {
  if (!text) return text;
  try {
    let textParts = text.split(':');
    if (textParts.length !== 2) return text;
    let iv = Buffer.from(textParts.shift(), 'hex');
    let encryptedText = Buffer.from(textParts.join(':'), 'hex');
    let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.substring(0, 32)), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (e) {
    return text;
  }
}


const file = path.join(__dirname, 'data.json');
const adapter = new JSONFile(file);
// Provide default data to avoid lowdb missing default data error
const defaultData = {
  users: [], instruments: [], bookings: [], vendors: [], products: [], utilities: [],
  // HR / Task / Leave collections
  departments: [], designations: [], employee_profiles: [],
  tasks: [], task_subtasks: [], task_comments: [], task_attachments: [],
  daily_reports: [],
  leave_types: [], leave_balances: [], leave_requests: [], leave_approvals: [],
  holidays: [], attendance: [], notifications: [], audit_logs: [],
  hr_settings: {}
};
const db = new Low(adapter, defaultData);

async function init() {
  await db.read();
  db.data = db.data || { users: [], instruments: [], bookings: [], vendors: [], products: [], utilities: [] };
  
  if (!db.data.vendors) db.data.vendors = [];
  if (!db.data.products) db.data.products = [];
  if (!db.data.utilities) db.data.utilities = [];
  // HR / Task / Leave collections — additive migration
  if (!db.data.departments) db.data.departments = [];
  if (!db.data.designations) db.data.designations = [];
  if (!db.data.employee_profiles) db.data.employee_profiles = [];
  if (!db.data.tasks) db.data.tasks = [];
  if (!db.data.task_subtasks) db.data.task_subtasks = [];
  if (!db.data.task_comments) db.data.task_comments = [];
  if (!db.data.task_attachments) db.data.task_attachments = [];
  if (!db.data.daily_reports) db.data.daily_reports = [];
  if (!db.data.leave_types) db.data.leave_types = [];
  if (!db.data.leave_balances) db.data.leave_balances = [];
  if (!db.data.leave_requests) db.data.leave_requests = [];
  if (!db.data.leave_approvals) db.data.leave_approvals = [];
  if (!db.data.holidays) db.data.holidays = [];
  if (!db.data.attendance) db.data.attendance = [];
  if (!db.data.notifications) db.data.notifications = [];
  if (!db.data.audit_logs) db.data.audit_logs = [];
  if (!db.data.hr_settings || Object.keys(db.data.hr_settings).length === 0) {
    db.data.hr_settings = {
      workingDays: ['Monday','Tuesday','Wednesday','Thursday','Friday'],
      workingHoursStart: '09:00',
      workingHoursEnd: '18:00',
      weekendDays: ['Saturday','Sunday'],
      maxConsecutiveLeave: 10,
      carryForwardLeave: false,
      approvalHierarchy: ['manager','admin'],
      dailyReportDeadlineTime: '19:00',
      reminderBeforeDeadlineMinutes: 60
    };
  }
  // Seed default departments
  if (db.data.departments.length === 0) {
    db.data.departments = [
      { id: 'dept-energy', name: 'Energy Auditing', code: 'EA', description: 'Energy audit and analysis team' },
      { id: 'dept-instruments', name: 'Instrumentation', code: 'INST', description: 'Instrument management and calibration' },
      { id: 'dept-admin', name: 'Administration', code: 'ADMIN', description: 'Administrative and HR functions' },
      { id: 'dept-it', name: 'IT & Systems', code: 'IT', description: 'IT infrastructure and systems' }
    ];
  }
  // Seed default designations
  if (db.data.designations.length === 0) {
    db.data.designations = [
      { id: 'desg-intern', name: 'Intern', level: 1 },
      { id: 'desg-junior', name: 'Junior Engineer', level: 2 },
      { id: 'desg-engineer', name: 'Engineer', level: 3 },
      { id: 'desg-senior', name: 'Senior Engineer', level: 4 },
      { id: 'desg-lead', name: 'Team Lead', level: 5 },
      { id: 'desg-manager', name: 'Manager', level: 6 },
      { id: 'desg-admin', name: 'Administrator', level: 7 }
    ];
  }
  // Seed default leave types
  if (db.data.leave_types.length === 0) {
    db.data.leave_types = [
      { id: 'lt-casual', name: 'Casual Leave', code: 'CL', defaultDays: 12, isPaid: true, carryForward: false, isActive: true, color: '#3b82f6', description: 'General purpose leave' },
      { id: 'lt-sick', name: 'Sick Leave', code: 'SL', defaultDays: 10, isPaid: true, carryForward: false, isActive: true, color: '#ef4444', description: 'Medical and health leave' },
      { id: 'lt-earned', name: 'Earned Leave', code: 'EL', defaultDays: 15, isPaid: true, carryForward: true, isActive: true, color: '#10b981', description: 'Annual earned leave' },
      { id: 'lt-lop', name: 'Loss of Pay', code: 'LOP', defaultDays: 0, isPaid: false, carryForward: false, isActive: true, color: '#f59e0b', description: 'Unpaid leave' },
      { id: 'lt-permission', name: 'Permission', code: 'PERM', defaultDays: 12, isPaid: true, carryForward: false, isActive: true, color: '#8b5cf6', description: 'Short permission (half-day)' },
      { id: 'lt-wfh', name: 'Work From Home', code: 'WFH', defaultDays: 24, isPaid: true, carryForward: false, isActive: true, color: '#06b6d4', description: 'Remote working days' },
      { id: 'lt-od', name: 'On Duty', code: 'OD', defaultDays: 0, isPaid: true, carryForward: false, isActive: true, color: '#64748b', description: 'Official duty away from office' }
    ];
  }
  // Seed national/company holidays for current year
  if (db.data.holidays.length === 0) {
    const yr = new Date().getFullYear();
    db.data.holidays = [
      { id: 'hol-repday', name: 'Republic Day', date: `${yr}-01-26`, type: 'national', isOptional: false, description: 'National Holiday' },
      { id: 'hol-holi', name: 'Holi', date: `${yr}-03-14`, type: 'national', isOptional: false, description: 'Festival of Colors' },
      { id: 'hol-indday', name: 'Independence Day', date: `${yr}-08-15`, type: 'national', isOptional: false, description: 'National Holiday' },
      { id: 'hol-gandhi', name: 'Gandhi Jayanti', date: `${yr}-10-02`, type: 'national', isOptional: false, description: 'National Holiday' },
      { id: 'hol-diwali', name: 'Diwali', date: `${yr}-10-20`, type: 'national', isOptional: false, description: 'Festival of Lights' },
      { id: 'hol-xmas', name: 'Christmas Day', date: `${yr}-12-25`, type: 'national', isOptional: false, description: 'National Holiday' }
    ];
  }

  // Ensure default admin user exists
  if (!db.data.users || db.data.users.length === 0) {
    db.data.users = [
      {
        id: 'admin',
        name: encrypt('Administrator'),
        email: encrypt('admin'),
        phone: encrypt('1234567890'),
        password: 'VcydDPyQRH9@zU7',
        role: 'admin'
      }
    ];
  } else {
    // Migration: Update password of the primary admin user and encrypt unencrypted users
    let updated = false;
    for (const u of db.data.users) {
      if (u.name && !u.name.includes(':')) {
        u.name = encrypt(u.name);
        updated = true;
      }
      if (u.email && !u.email.includes(':')) {
        u.email = encrypt(u.email);
        updated = true;
      }
      if (u.phone && !u.phone.includes(':')) {
        u.phone = encrypt(u.phone);
        updated = true;
      }
    }
    const adminUser = db.data.users.find(u => String(decrypt(u.email)).toLowerCase() === 'admin');
    if (adminUser) {
      if (adminUser.password !== '$2b$10$oIAvTslehwcmWHATnLLKrOTAX3OA8JAZTOqD0ZePHc2htPkhTd2fW') {
        adminUser.password = '$2b$10$oIAvTslehwcmWHATnLLKrOTAX3OA8JAZTOqD0ZePHc2htPkhTd2fW';
        updated = true;
      }
    }
    if (updated) {
      await db.write();
    }
  }

  // Seed default utilities if empty
  if (db.data.utilities.length === 0) {
    const defaultUtils = [
      "Boiler", "Compressor", "Chiller", "Motor", "Pump",
      "HVAC", "Lighting", "Air Compressor", "Transformer", "Cooling Tower"
    ];
    db.data.utilities = defaultUtils.map(name => ({
      id: name.toLowerCase().trim(),
      name: name.trim()
    }));
  }

  // Seed default vendors and products if empty
  if (db.data.vendors.length === 0) {
    db.data.vendors = [
      {
        id: "VND-FLK01",
        name: "Fluke India Pvt Ltd",
        companyName: "Fluke Corporation",
        vendorType: "Manufacturer",
        status: "Active",
        contactPerson: "Rajesh Kumar",
        mobileNumber: "+919876543210",
        alternativeMobileNumber: "+918877665544",
        email: "rajesh@fluke.in",
        website: "www.fluke.com/en-in",
        streetAddress: "102 Industrial Tech Park, Phase 1",
        city: "Chennai",
        state: "Tamil Nadu",
        country: "India",
        pinCode: "600036",
        gstin: "33AAAAA1111A1Z1",
        pan: "AAAAA1111A",
        remarks: "Preferred manufacturer for high-end diagnostic and power quality analyzers."
      },
      {
        id: "VND-HIO02",
        name: "Hioki Instruments Distributor",
        companyName: "Hioki EE Corporation",
        vendorType: "Distributor",
        status: "Active",
        contactPerson: "Anita Patel",
        mobileNumber: "+919988776655",
        alternativeMobileNumber: "",
        email: "anita@hiokipapers.com",
        website: "www.hioki.com",
        streetAddress: "404 Trade Centre, MG Road",
        city: "Mumbai",
        state: "Maharashtra",
        country: "India",
        pinCode: "400001",
        gstin: "27BBBBB2222B2Z2",
        pan: "BBBBB2222B",
        remarks: "Primary source for clamp meters and logger probes."
      }
    ];

    db.data.products = [
      {
        id: "PRD-FL001",
        vendorId: "VND-FLK01",
        name: "Power Quality Analyzer Probe",
        description: "Flexible current probe for Fluke 1775.",
        category: "Accessories",
        brand: "Fluke",
        modelNumber: "PM9081",
        unitOfMeasurement: "Units",
        productStatus: "Active",
        utilityId: "transformer",
        utilityName: "Transformer"
      },
      {
        id: "PRD-HI002",
        vendorId: "VND-HIO02",
        name: "Hioki Clamp Logger Sensor",
        description: "AC/DC Current sensor for power loggers.",
        category: "Sensors",
        brand: "Hioki",
        modelNumber: "CT7631",
        unitOfMeasurement: "Units",
        productStatus: "Active",
        utilityId: "motor",
        utilityName: "Motor"
      }
    ];
  }

  await db.write();
  await hashPasswordsInDb();
}

async function getInstruments() {
    return db.data.instruments;
}

async function getInstrumentById(id) {
    return db.data.instruments.find(i => String(i.id) === String(id));
}

async function insertInstrument(it) {
    const id = nanoid(8);
  // default learning / documentation fields
  const defaults = {
    productImages: [],
    productOverview: '',
    specifications: '',
    parametersMeasured: '',
    accuracy: '',
    measurementRange: '',
    resolution: '',
    applications: '',
    operatingProcedure: '',
    calibrationProcedure: '',
    safetyInstructions: '',
    userManualUrl: '',
    youtubeUrl: '',
    // calibration fields
    lastCalibrationDate: null,
    nextCalibrationDate: null,
    calibrationCertificateUrl: '',
    calibrationCycleDays: 365
  };
  const row = { id, status: 'available', location: 'warehouse', ...defaults, ...it };
  db.data.instruments.push(row);
  await db.write();
  return row;
}

async function updateInstrument(id, fields) {
    const inst = db.data.instruments.find(i => String(i.id) === String(id));
  if (!inst) return null;
  Object.assign(inst, fields);
  await db.write();
  return inst;
}

async function deleteInstrument(id) {
    db.data.instruments = db.data.instruments.filter(i => String(i.id) !== String(id));
  await db.write();
}

async function deleteBooking(id) {
    db.data.bookings = db.data.bookings.filter(b => String(b.id) !== String(id));
  await db.write();
}

async function deleteBookingsByBulkGroupId(groupId) {
    db.data.bookings = db.data.bookings.filter(b => String(b.bulkGroupId) !== String(groupId));
  await db.write();
}

async function getUsers() {
    return db.data.users.map(u => ({
    ...u,
    name: decrypt(u.name),
    email: decrypt(u.email),
    phone: decrypt(u.phone)
  }));
}

async function insertBooking(b) {
    const id = nanoid(8);
  const row = { id, returnedDate: null, ...b };
  db.data.bookings.push(row);
  await db.write();
  return row;
}

async function getBookings() {
    return db.data.bookings;
}

async function findActiveBookingByInstrument(instrumentId) {
    const now = new Date();
  const bookings = db.data.bookings
    .filter(b => String(b.instrumentId) === String(instrumentId) && !b.returnedDate && b.status === 'approved')
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

  const activeBookings = bookings.filter(b => {
    const start = new Date(b.startDate);
    const due = new Date(b.dueDate);
    return start <= now && due >= now;
  });

  if (activeBookings.length > 0) {
    return activeBookings[activeBookings.length - 1];
  }

  // If no booking covers now, return the most recent overdue booking not yet returned.
  const overdue = bookings.filter(b => new Date(b.dueDate) < now);
  if (overdue.length > 0) {
    return overdue[overdue.length - 1];
  }

  if (bookings.length > 0) {
    return bookings[0];
  }

  return null;
}

async function returnBooking(bookingId, returnedDate, remarks, returnedById, returnedByName) {
    const b = db.data.bookings.find(x => String(x.id) === String(bookingId));
  if (!b) return null;
  b.returnedDate = returnedDate;
  b.dueDate = returnedDate;
  if (remarks) {
    b.returnRemarks = remarks;
  }
  if (returnedById) {
    b.returnedById = returnedById;
  }
  if (returnedByName) {
    b.returnedByName = returnedByName;
  }
  await db.write();
  return b;
}

async function setInstrumentInsight(instrumentId, insight) {
    const inst = db.data.instruments.find(i=>String(i.id)===String(instrumentId));
  if(!inst) return null;
  inst.lastInsight = insight;
  await db.write();
  return inst;
}

async function getInstrumentByIdFull(id){
    return db.data.instruments.find(i => String(i.id) === String(id));
}

async function getInstrumentsDueForCalibration(days=15){
    const now = new Date();
  const cutoff = new Date(now.getTime() + days*24*3600*1000);
  return db.data.instruments.filter(i=> i.nextCalibrationDate && new Date(i.nextCalibrationDate) >= now && new Date(i.nextCalibrationDate) <= cutoff);
}

async function writeData() { await db.write(); }

async function setBookings(bookings) {
    db.data.bookings = bookings;
  await db.write();
  return db.data.bookings;
}

async function hashPasswordsInDb() {
    let updated = false;
  db.data.users = db.data.users || [];
  for (const user of db.data.users) {
    if (user.password && !user.password.startsWith('$2a$') && !user.password.startsWith('$2b$')) {
      user.password = await bcrypt.hash(user.password, 10);
      updated = true;
    }
  }
  if (updated) {
    await db.write();
    console.log('Successfully migrated passwords to secure bcrypt hashes.');
  }
}

async function insertUser(u) {
    const id = nanoid(8);
  const hashedPassword = await bcrypt.hash(u.password, 10);
  const row = {
    id,
    name: encrypt(u.name),
    email: encrypt(u.email),
    phone: encrypt(u.phone),
    password: hashedPassword,
    role: u.role
  };
  db.data.users.push(row);
  await db.write();
  return { ...row, name: u.name, email: u.email, phone: u.phone };
}

async function getUserByEmail(email) {
  const users = await getUsers();
  return users.find(u => String(u.email).toLowerCase() === String(email).toLowerCase());
}

async function getBookingById(id) {
    return db.data.bookings.find(b => String(b.id) === String(id));
}

async function updateBooking(id, fields) {
    const b = db.data.bookings.find(x => String(x.id) === String(id));
  if (!b) return null;
  Object.assign(b, fields);
  await db.write();
  return b;
}

async function getBookingsByBulkGroupId(groupId) {
    return db.data.bookings.filter(b => b.bulkGroupId === groupId);
}

async function deleteUser(id) {
    db.data.users = db.data.users.filter(u => String(u.id) !== String(id));
  await db.write();
}

async function updateUser(id, fields) {
    const u = db.data.users.find(x => String(x.id) === String(id));
  if (!u) return null;
  
  const encryptedFields = { ...fields };
  if (fields.name !== undefined) encryptedFields.name = encrypt(fields.name);
  if (fields.email !== undefined) encryptedFields.email = encrypt(fields.email);
  if (fields.phone !== undefined) encryptedFields.phone = encrypt(fields.phone);
  
  Object.assign(u, encryptedFields);
  await db.write();
  
  return {
    ...u,
    name: fields.name !== undefined ? fields.name : decrypt(u.name),
    email: fields.email !== undefined ? fields.email : decrypt(u.email),
    phone: fields.phone !== undefined ? fields.phone : decrypt(u.phone)
  };
}

async function getVendors() {
    return db.data.vendors || [];
}

async function getVendorById(id) {
    return (db.data.vendors || []).find(v => String(v.id) === String(id));
}

async function insertVendor(v) {
    const id = 'VND' + nanoid(5).toUpperCase();
  const row = { id, ...v };
  db.data.vendors = db.data.vendors || [];
  db.data.vendors.push(row);
  await db.write();
  return row;
}

async function updateVendor(id, fields) {
    const vendor = (db.data.vendors || []).find(v => String(v.id) === String(id));
  if (!vendor) return null;
  Object.assign(vendor, fields);
  await db.write();
  return vendor;
}

async function deleteVendor(id) {
    db.data.vendors = (db.data.vendors || []).filter(v => String(v.id) !== String(id));
  db.data.products = (db.data.products || []).filter(p => String(p.vendorId) !== String(id));
  await db.write();
}

async function getProducts() {
    return db.data.products || [];
}

async function getProductsByVendor(vendorId) {
    return (db.data.products || []).filter(p => String(p.vendorId) === String(vendorId));
}

async function getProductById(id) {
    return (db.data.products || []).find(p => String(p.id) === String(id));
}

async function insertProduct(p) {
    const id = 'PRD' + nanoid(5).toUpperCase();
  const row = { id, ...p };
  db.data.products = db.data.products || [];
  db.data.products.push(row);
  await db.write();
  return row;
}

async function updateProduct(id, fields) {
    const prod = (db.data.products || []).find(p => String(p.id) === String(id));
  if (!prod) return null;
  Object.assign(prod, fields);
  await db.write();
  return prod;
}

async function deleteProduct(id) {
    db.data.products = (db.data.products || []).filter(p => String(p.id) !== String(id));
  await db.write();
}

async function getUtilities() {
    return db.data.utilities || [];
}

async function insertUtility(name) {
    db.data.utilities = db.data.utilities || [];
  const norm = name.toLowerCase().trim();
  const existing = db.data.utilities.find(u => u.id === norm);
  if (existing) {
    return existing;
  }
  const row = { id: norm, name: name.trim() };
  db.data.utilities.push(row);
  await db.write();
  return row;
}

// ─── DEPARTMENTS ─────────────────────────────────────────────────────────────
async function getDepartments() { return db.data.departments || []; }
async function insertDepartment(d) {
  const id = 'dept-' + nanoid(6);
  const row = { id, ...d, createdAt: new Date().toISOString() };
  db.data.departments.push(row); await db.write(); return row;
}
async function updateDepartment(id, fields) {
  const d = db.data.departments.find(x => String(x.id) === String(id));
  if (!d) return null; Object.assign(d, fields); await db.write(); return d;
}
async function deleteDepartment(id) {
  db.data.departments = db.data.departments.filter(x => String(x.id) !== String(id));
  await db.write();
}

// ─── DESIGNATIONS ─────────────────────────────────────────────────────────────
async function getDesignations() { return db.data.designations || []; }
async function insertDesignation(d) {
  const id = 'desg-' + nanoid(6);
  const row = { id, ...d, createdAt: new Date().toISOString() };
  db.data.designations.push(row); await db.write(); return row;
}
async function updateDesignation(id, fields) {
  const d = db.data.designations.find(x => String(x.id) === String(id));
  if (!d) return null; Object.assign(d, fields); await db.write(); return d;
}
async function deleteDesignation(id) {
  db.data.designations = db.data.designations.filter(x => String(x.id) !== String(id));
  await db.write();
}

// ─── EMPLOYEE PROFILES ───────────────────────────────────────────────────────
async function getEmployeeProfiles() { return db.data.employee_profiles || []; }
async function getEmployeeProfileByUserId(userId) {
  return (db.data.employee_profiles || []).find(p => String(p.userId) === String(userId));
}
async function upsertEmployeeProfile(userId, fields) {
  let p = db.data.employee_profiles.find(x => String(x.userId) === String(userId));
  if (p) {
    Object.assign(p, fields, { updatedAt: new Date().toISOString() });
  } else {
    p = { id: 'emp-' + nanoid(6), userId, ...fields, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    db.data.employee_profiles.push(p);
  }
  await db.write(); return p;
}

// ─── TASKS ───────────────────────────────────────────────────────────────────
async function getTasks() { return db.data.tasks || []; }
async function getTaskById(id) { return (db.data.tasks || []).find(t => String(t.id) === String(id)); }
async function insertTask(t) {
  const id = 'TASK-' + nanoid(6).toUpperCase();
  const row = { id, status: 'assigned', percentComplete: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...t };
  db.data.tasks.push(row); await db.write(); return row;
}
async function updateTask(id, fields) {
  const t = db.data.tasks.find(x => String(x.id) === String(id));
  if (!t) return null;
  Object.assign(t, fields, { updatedAt: new Date().toISOString() });
  await db.write(); return t;
}
async function deleteTask(id) {
  db.data.tasks = db.data.tasks.filter(x => String(x.id) !== String(id));
  db.data.task_subtasks = (db.data.task_subtasks || []).filter(x => String(x.taskId) !== String(id));
  db.data.task_comments = (db.data.task_comments || []).filter(x => String(x.taskId) !== String(id));
  db.data.task_attachments = (db.data.task_attachments || []).filter(x => String(x.taskId) !== String(id));
  await db.write();
}

// ─── TASK SUBTASKS ────────────────────────────────────────────────────────────
async function getSubtasksByTask(taskId) {
  return (db.data.task_subtasks || []).filter(x => String(x.taskId) === String(taskId));
}
async function insertSubtask(taskId, data) {
  const id = 'ST-' + nanoid(6);
  const row = { id, taskId, completed: false, createdAt: new Date().toISOString(), ...data };
  db.data.task_subtasks.push(row); await db.write(); return row;
}
async function updateSubtask(id, fields) {
  const s = db.data.task_subtasks.find(x => String(x.id) === String(id));
  if (!s) return null; Object.assign(s, fields); await db.write(); return s;
}
async function deleteSubtask(id) {
  db.data.task_subtasks = db.data.task_subtasks.filter(x => String(x.id) !== String(id));
  await db.write();
}

// ─── TASK COMMENTS ────────────────────────────────────────────────────────────
async function getCommentsByTask(taskId) {
  return (db.data.task_comments || []).filter(x => String(x.taskId) === String(taskId));
}
async function insertComment(taskId, data) {
  const id = 'CMT-' + nanoid(6);
  const row = { id, taskId, createdAt: new Date().toISOString(), ...data };
  db.data.task_comments.push(row); await db.write(); return row;
}
async function deleteComment(id) {
  db.data.task_comments = db.data.task_comments.filter(x => String(x.id) !== String(id));
  await db.write();
}

// ─── TASK ATTACHMENTS ─────────────────────────────────────────────────────────
async function getAttachmentsByTask(taskId) {
  return (db.data.task_attachments || []).filter(x => String(x.taskId) === String(taskId));
}
async function insertAttachment(taskId, data) {
  const id = 'ATT-' + nanoid(6);
  const row = { id, taskId, uploadedAt: new Date().toISOString(), ...data };
  db.data.task_attachments.push(row); await db.write(); return row;
}
async function deleteAttachment(id) {
  const att = (db.data.task_attachments || []).find(x => String(x.id) === String(id));
  db.data.task_attachments = (db.data.task_attachments || []).filter(x => String(x.id) !== String(id));
  await db.write(); return att;
}

// ─── DAILY REPORTS ────────────────────────────────────────────────────────────
async function getDailyReports() { return db.data.daily_reports || []; }
async function getDailyReportById(id) { return (db.data.daily_reports || []).find(r => String(r.id) === String(id)); }
async function getDailyReportByEmployeeDate(userId, date) {
  return (db.data.daily_reports || []).find(r => String(r.userId) === String(userId) && r.date === date);
}
async function insertDailyReport(data) {
  const id = 'DR-' + nanoid(6);
  const row = { id, status: 'submitted', submittedAt: new Date().toISOString(), ...data };
  db.data.daily_reports.push(row); await db.write(); return row;
}
async function updateDailyReport(id, fields) {
  const r = db.data.daily_reports.find(x => String(x.id) === String(id));
  if (!r) return null; Object.assign(r, fields); await db.write(); return r;
}

// ─── LEAVE TYPES ──────────────────────────────────────────────────────────────
async function getLeaveTypes() { return db.data.leave_types || []; }
async function getLeaveTypeById(id) { return (db.data.leave_types || []).find(x => String(x.id) === String(id)); }
async function insertLeaveType(data) {
  const id = 'lt-' + nanoid(6);
  const row = { id, isActive: true, ...data };
  db.data.leave_types.push(row); await db.write(); return row;
}
async function updateLeaveType(id, fields) {
  const t = db.data.leave_types.find(x => String(x.id) === String(id));
  if (!t) return null; Object.assign(t, fields); await db.write(); return t;
}
async function deleteLeaveType(id) {
  db.data.leave_types = db.data.leave_types.filter(x => String(x.id) !== String(id));
  await db.write();
}

// ─── LEAVE BALANCES ───────────────────────────────────────────────────────────
async function getLeaveBalances() { return db.data.leave_balances || []; }
async function getLeaveBalanceByEmployee(userId) {
  return (db.data.leave_balances || []).filter(b => String(b.userId) === String(userId));
}
async function getLeaveBalance(userId, leaveTypeId) {
  return (db.data.leave_balances || []).find(b => String(b.userId) === String(userId) && String(b.leaveTypeId) === String(leaveTypeId));
}
async function upsertLeaveBalance(userId, leaveTypeId, fields) {
  let b = (db.data.leave_balances || []).find(x => String(x.userId) === String(userId) && String(x.leaveTypeId) === String(leaveTypeId));
  if (b) {
    Object.assign(b, fields);
  } else {
    b = { id: 'lb-' + nanoid(6), userId, leaveTypeId, ...fields };
    db.data.leave_balances.push(b);
  }
  await db.write(); return b;
}
async function initLeaveBalancesForUser(userId, year) {
  const leaveTypes = await getLeaveTypes();
  for (const lt of leaveTypes) {
    const existing = await getLeaveBalance(userId, lt.id);
    if (!existing) {
      await upsertLeaveBalance(userId, lt.id, {
        year: year || new Date().getFullYear(),
        totalDays: lt.defaultDays || 0,
        usedDays: 0,
        pendingDays: 0
      });
    }
  }
}

// ─── LEAVE REQUESTS ───────────────────────────────────────────────────────────
async function getLeaveRequests() { return db.data.leave_requests || []; }
async function getLeaveRequestById(id) { return (db.data.leave_requests || []).find(r => String(r.id) === String(id)); }
async function getLeaveRequestsByEmployee(userId) {
  return (db.data.leave_requests || []).filter(r => String(r.userId) === String(userId));
}
async function insertLeaveRequest(data) {
  const id = 'LR-' + nanoid(6).toUpperCase();
  const row = { id, status: 'submitted', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...data };
  db.data.leave_requests.push(row); await db.write(); return row;
}
async function updateLeaveRequest(id, fields) {
  const r = db.data.leave_requests.find(x => String(x.id) === String(id));
  if (!r) return null;
  Object.assign(r, fields, { updatedAt: new Date().toISOString() });
  await db.write(); return r;
}

// ─── LEAVE APPROVALS ──────────────────────────────────────────────────────────
async function getLeaveApprovalsByRequest(leaveRequestId) {
  return (db.data.leave_approvals || []).filter(a => String(a.leaveRequestId) === String(leaveRequestId));
}
async function insertLeaveApproval(data) {
  const id = 'LA-' + nanoid(6);
  const row = { id, createdAt: new Date().toISOString(), ...data };
  db.data.leave_approvals.push(row); await db.write(); return row;
}

// ─── HOLIDAYS ─────────────────────────────────────────────────────────────────
async function getHolidays() { return db.data.holidays || []; }
async function getHolidayById(id) { return (db.data.holidays || []).find(h => String(h.id) === String(id)); }
async function insertHoliday(data) {
  const id = 'hol-' + nanoid(6);
  const row = { id, ...data };
  db.data.holidays.push(row); await db.write(); return row;
}
async function updateHoliday(id, fields) {
  const h = db.data.holidays.find(x => String(x.id) === String(id));
  if (!h) return null; Object.assign(h, fields); await db.write(); return h;
}
async function deleteHoliday(id) {
  db.data.holidays = db.data.holidays.filter(x => String(x.id) !== String(id));
  await db.write();
}

// ─── ATTENDANCE ───────────────────────────────────────────────────────────────
async function getAttendance() { return db.data.attendance || []; }
async function getTodayAttendance(userId) {
  const today = new Date().toISOString().slice(0, 10);
  return (db.data.attendance || []).find(a => String(a.userId) === String(userId) && a.date === today);
}
async function getAttendanceByEmployee(userId) {
  return (db.data.attendance || []).filter(a => String(a.userId) === String(userId));
}
async function upsertAttendance(userId, date, fields) {
  let a = (db.data.attendance || []).find(x => String(x.userId) === String(userId) && x.date === date);
  if (a) {
    Object.assign(a, fields);
  } else {
    a = { id: 'ATD-' + nanoid(6), userId, date, ...fields };
    db.data.attendance.push(a);
  }
  await db.write(); return a;
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
async function getNotifications() { return db.data.notifications || []; }
async function getNotificationsByUser(userId) {
  return (db.data.notifications || []).filter(n => String(n.userId) === String(userId)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 100);
}
async function insertNotification(data) {
  const id = 'NOT-' + nanoid(6);
  const row = { id, read: false, createdAt: new Date().toISOString(), ...data };
  db.data.notifications.push(row); await db.write(); return row;
}
async function markNotificationRead(id) {
  const n = (db.data.notifications || []).find(x => String(x.id) === String(id));
  if (n) { n.read = true; await db.write(); } return n;
}
async function markAllNotificationsRead(userId) {
  (db.data.notifications || []).filter(n => String(n.userId) === String(userId)).forEach(n => { n.read = true; });
  await db.write();
}

// ─── AUDIT LOGS ───────────────────────────────────────────────────────────────
async function getAuditLogs() { return (db.data.audit_logs || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 500); }
async function insertAuditLog(data) {
  const id = 'AL-' + nanoid(8);
  const row = { id, timestamp: new Date().toISOString(), ...data };
  db.data.audit_logs.push(row);
  // Keep only last 1000 audit logs to prevent data.json bloat
  if (db.data.audit_logs.length > 1000) db.data.audit_logs = db.data.audit_logs.slice(-1000);
  await db.write(); return row;
}

// ─── HR SETTINGS ──────────────────────────────────────────────────────────────
async function getHrSettings() { return db.data.hr_settings || {}; }
async function updateHrSettings(fields) {
  db.data.hr_settings = { ...db.data.hr_settings, ...fields };
  await db.write(); return db.data.hr_settings;
}

module.exports = {
  init,
  getInstruments,
  getInstrumentById,
  insertInstrument,
  updateInstrument,
  deleteInstrument,
  getUsers,
  insertUser,
  getUserByEmail,
  insertBooking,
  getBookings,
  getBookingById,
  updateBooking,
  findActiveBookingByInstrument,
  returnBooking,
  setInstrumentInsight,
  getInstrumentByIdFull,
  getBookingsByBulkGroupId,
  deleteBooking,
  deleteBookingsByBulkGroupId,
  deleteUser,
  updateUser,
  hashPasswordsInDb,
  writeData,
  setBookings,
  getVendors,
  getVendorById,
  insertVendor,
  updateVendor,
  deleteVendor,
  getProducts,
  getProductsByVendor,
  getProductById,
  insertProduct,
  updateProduct,
  deleteProduct,
  getUtilities,
  insertUtility,
  // HR / Task / Leave
  getDepartments, insertDepartment, updateDepartment, deleteDepartment,
  getDesignations, insertDesignation, updateDesignation, deleteDesignation,
  getEmployeeProfiles, getEmployeeProfileByUserId, upsertEmployeeProfile,
  getTasks, getTaskById, insertTask, updateTask, deleteTask,
  getSubtasksByTask, insertSubtask, updateSubtask, deleteSubtask,
  getCommentsByTask, insertComment, deleteComment,
  getAttachmentsByTask, insertAttachment, deleteAttachment,
  getDailyReports, getDailyReportById, getDailyReportByEmployeeDate, insertDailyReport, updateDailyReport,
  getLeaveTypes, getLeaveTypeById, insertLeaveType, updateLeaveType, deleteLeaveType,
  getLeaveBalances, getLeaveBalanceByEmployee, getLeaveBalance, upsertLeaveBalance, initLeaveBalancesForUser,
  getLeaveRequests, getLeaveRequestById, getLeaveRequestsByEmployee, insertLeaveRequest, updateLeaveRequest,
  getLeaveApprovalsByRequest, insertLeaveApproval,
  getHolidays, getHolidayById, insertHoliday, updateHoliday, deleteHoliday,
  getAttendance, getTodayAttendance, getAttendanceByEmployee, upsertAttendance,
  getNotifications, getNotificationsByUser, insertNotification, markNotificationRead, markAllNotificationsRead,
  getAuditLogs, insertAuditLog,
  getHrSettings, updateHrSettings
};
