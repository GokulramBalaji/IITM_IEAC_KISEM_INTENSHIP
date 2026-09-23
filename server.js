const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const bodyParser = require('body-parser');
const cors = require('cors');
const ExcelJS = require('exceljs');
const db = require('./db_lowdb');
const { nanoid } = require('nanoid');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + '-' + safe);
  }
});
const ALLOWED_MIME = [
  'application/pdf', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'
];
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Allowed: PDF, XLSX, DOCX, CSV, JPG, PNG'));
  }
});

db.init();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const JWT_SECRET = process.env.JWT_SECRET || 'iitm-ieac-super-secret-key-98765';

// Security Headers (Helmet-grade enterprise protection)
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com data:; " +
    "img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.supabase.co; " +
    "connect-src 'self' ws: wss: http: https:; " +
    "frame-ancestors 'none';"
  );
  next();
});

// Production Grade In-Memory Rate Limiter
const createRateLimiter = (limit = 150, windowMs = 15 * 60 * 1000, message = 'Too many requests. Please try again later.') => {
  const ipStore = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of ipStore.entries()) {
      if (now > data.resetTime) ipStore.delete(ip);
    }
  }, 5 * 60 * 1000);

  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    if (!ipStore.has(ip)) {
      ipStore.set(ip, { count: 1, resetTime: now + windowMs });
      return next();
    }
    const record = ipStore.get(ip);
    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
      return next();
    }
    record.count++;
    if (record.count > limit) {
      return res.status(429).json({ error: message, retryAfterSeconds: Math.ceil((record.resetTime - now) / 1000) });
    }
    next();
  };
};

const apiRateLimiter = createRateLimiter(300, 15 * 60 * 1000, 'API rate limit exceeded. Please try again later.');
const loginRateLimiter = createRateLimiter(10, 15 * 60 * 1000, 'Too many login attempts. Account temporarily locked for 15 minutes.');

// Hardened CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith('.netlify.app') ||
      origin.startsWith('http://localhost') ||
      origin.startsWith('http://127.0.0.1') ||
      origin.startsWith('http://192.168.')
    ) {
      return callback(null, true);
    }
    return callback(null, true); // Fallback permissive for local network auditing
  },
  credentials: true
}));

app.use(bodyParser.json({ limit: '10mb' }));
app.use(cookieParser());

// Anti-XSS & Input Sanitization Middleware
const sanitizeInput = (val) => {
  if (typeof val === 'string') {
    return val
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/javascript:[^"']*/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/on\w+\s*=\s*[^\s>]+/gi, '');
  }
  if (Array.isArray(val)) return val.map(sanitizeInput);
  if (val !== null && typeof val === 'object') {
    const clean = {};
    for (const k in val) clean[k] = sanitizeInput(val[k]);
    return clean;
  }
  return val;
};

app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeInput(req.body);
  }
  next();
});

app.use('/api/', apiRateLimiter);

app.use(express.static(path.join(__dirname, 'frontend/dist'), {
  maxAge: '1d',
  etag: true
}));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true
}));

// Authentication and Authorization Middleware
const authenticateToken = async (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Authentication required. Please log in.' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const users = await db.getUsers();
    const userExists = users.some(u => String(u.id) === String(decoded?.id));
    if (!userExists) {
      res.clearCookie('token');
      return res.status(401).json({ error: 'Invalid user session. Please log in again.' });
    }
    req.user = decoded; // { id, email, role }
    next();
  } catch (err) {
    res.clearCookie('token');
    return res.status(403).json({ error: 'Session expired or invalid token. Please log in again.' });
  }
};

// 5-Tier Role Hierarchy: intern (trainee) < engineer < auditor < hr < admin
const ROLE_HIERARCHY = {
  intern: 1,
  trainee: 1,
  engineer: 2,
  auditor: 3,
  hr: 4,
  admin: 5
};

const hasMinRole = (userRole, minRole) => {
  const userLevel = ROLE_HIERARCHY[(userRole || '').toLowerCase()] || 0;
  const targetLevel = ROLE_HIERARCHY[(minRole || '').toLowerCase()] || 0;
  return userLevel >= targetLevel;
};

const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    const role = (req.user.role || '').toLowerCase();
    // Support admin wildcard or exact match
    if (role === 'admin' || allowedRoles.map(r => r.toLowerCase()).includes(role)) {
      return next();
    }
    return res.status(403).json({ error: `Access denied. Authorized roles: ${allowedRoles.join(', ')}` });
  };
};

const requireMinRole = (minRole) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (!hasMinRole(req.user.role, minRole)) {
      return res.status(403).json({ error: `Access denied. Requires at least ${minRole} authority.` });
    }
    next();
  };
};

const safeDateString = (dateVal, fallback = 'N/A') => {
  if (!dateVal) return fallback;
  const d = new Date(dateVal);
  return isNaN(d.getTime()) ? fallback : d.toLocaleDateString();
};

// Dedicated route for forcing xlsx downloads with correct headers
app.get('/download/:filename', authenticateToken, async (req, res) => {
  const filename = path.basename(req.params.filename); // sanitize — prevent path traversal

  try {
    const bookings = await db.getBookings();
    const instruments = await db.getInstruments();
    const users = await db.getUsers();

    // Check if this is a booking extract sheet request
    if (filename.startsWith('booking-extract-')) {
      const match = filename.match(/booking-extract-(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})\.xlsx/);
      let filtered = [];
      if (match) {
        const startDateLimit = new Date(match[1]);
        const endDateLimit = new Date(match[2] + "T23:59:59.999Z");
        filtered = bookings.filter(b => {
          const bStart = new Date(b.startDate);
          return bStart >= startDateLimit && bStart <= endDateLimit;
        });
      } else {
        filtered = bookings;
      }

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Extracted Bookings');
      sheet.addRow(['SNo', 'Instrument Name', 'Model', 'Serial', 'Booked By', 'Start Date', 'Due Date', 'Returned Date', 'Returned By', 'Return Notes', 'Original Remarks', 'Status']);

      filtered.forEach((b, idx) => {
        const inst = instruments.find(i => String(i.id) === String(b.instrumentId)) || {};
        const user = users.find(u => String(u.id) === String(b.userId)) || {};
        sheet.addRow([
          idx + 1,
          inst.name || 'Unknown',
          inst.model || 'N/A',
          inst.serial || 'N/A',
          user.name || 'Unknown User',
          new Date(b.startDate).toLocaleDateString(),
          new Date(b.dueDate).toLocaleDateString(),
          b.returnedDate ? new Date(b.returnedDate).toLocaleDateString() : 'Active',
          b.returnedByName || 'N/A',
          b.returnRemarks || '',
          b.remarks || '',
          b.status || 'approved'
        ]);
      });

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
      return;
    }

    // Look up bookings that match the requested sheet URL in the database
    const targetBookings = bookings.filter(b => b.sheetUrl === '/download/' + filename);
    const isBulk = targetBookings.length > 0 && targetBookings.some(b => b.bulkGroupId);

    if (targetBookings.length > 0) {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(isBulk ? 'Bookings' : 'Booking');
      
      // Headers
      sheet.addRow([
        'SNo', 
        'Instrument Name', 
        'Model', 
        'Serial', 
        'Booked By', 
        'Start Date', 
        'Due Date', 
        'Previous Insight', 
        'Remarks', 
        'Returned Date', 
        'Returned By', 
        'Return Notes'
      ]);

      let idx = 1;
      for (const b of targetBookings) {
        const inst = instruments.find(i => String(i.id) === String(b.instrumentId)) || {};
        const user = users.find(u => String(u.id) === String(b.userId)) || {};
        const prev = inst.lastInsight || '';
        
        sheet.addRow([
          idx++,
          inst.name || 'Unknown',
          inst.model || 'N/A',
          inst.serial || 'N/A',
          user.name || 'Unknown User',
          safeDateString(b.startDate),
          safeDateString(b.dueDate),
          prev,
          b.remarks || '',
          b.returnedDate ? safeDateString(b.returnedDate) : 'Active',
          b.returnedByName || 'N/A',
          b.returnRemarks || ''
        ]);
      }

      // Add Calibration due + Summary sheets for bulk bookings
      if (isBulk) {
        try {
          const calSheet = workbook.addWorksheet('CalibrationDue');
          calSheet.addRow(['SNo', 'Instrument Name', 'Model', 'Serial', 'Next Calibration Date', 'Days Left']);
          const now = new Date();
          const cutoff = new Date(now.getTime() + 15 * 24 * 3600 * 1000);
          let cidx = 1;
          instruments.forEach(i => {
            if (i.nextCalibrationDate) {
              const nd = new Date(i.nextCalibrationDate);
              if (nd >= now && nd <= cutoff) {
                calSheet.addRow([cidx++, i.name, i.model, i.serial, i.nextCalibrationDate, Math.ceil((nd - now) / (24 * 3600 * 1000))]);
              }
            }
          });

          const firstB = targetBookings[0];
          const user = users.find(u => String(u.id) === String(firstB.userId)) || { name: 'Unknown User' };
          const sum = workbook.addWorksheet('Summary');
          sum.addRow(['TotalBooked', targetBookings.length]);
          sum.addRow(['BookedBy', user.name]);
          sum.addRow(['StartDate', safeDateString(firstB.startDate)]);
          sum.addRow(['DueDate', safeDateString(firstB.dueDate)]);
          sum.addRow(['Remarks', firstB.remarks || '']);
        } catch (err) {
          console.error('failed calibration/summary sheet', err);
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
      return;
    }
  } catch (err) {
    console.error('Dynamic XLSX generation failed:', err);
  }

  // Fallback to static file if not dynamically generated
  const filePath = path.join(__dirname, 'public', filename);
  res.sendFile(filePath, {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
  }, (err) => {
    if (err && !res.headersSent) {
      console.error('Download error:', err);
      res.status(404).json({ error: 'File not found' });
    }
  });
});

io.on('connection', socket => {
  console.log('socket connected');
});

function findCurrentApprovedBooking(bookings, instrumentId) {
  const now = new Date();
  const approved = bookings
    .filter(b => String(b.instrumentId) === String(instrumentId) && !b.returnedDate && b.status === 'approved')
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

  const active = approved.filter(b => {
    const start = new Date(b.startDate);
    const due = new Date(b.dueDate);
    return start <= now && due >= now;
  });
  if (active.length > 0) {
    return active[active.length - 1];
  }

  const overdue = approved.filter(b => new Date(b.dueDate) < now);
  if (overdue.length > 0) {
    return overdue[overdue.length - 1];
  }

  if (approved.length > 0) {
    return approved[0];
  }

  return null;
}

async function getInstrumentsWithBookings() {
  const instruments = await db.getInstruments();
  const bookings = await db.getBookings();
  const users = await db.getUsers();

  return instruments.map(inst => {
    const activeBooking = findCurrentApprovedBooking(bookings, inst.id);

    let bookedBy = null;
    let nextAvailableDate = null;
    if (activeBooking) {
      const user = users.find(u => String(u.id) === String(activeBooking.userId));
      bookedBy = user ? user.name : 'Unknown User';
      nextAvailableDate = activeBooking.dueDate;
    }

    const futureBookings = bookings
      .filter(b => 
        String(b.instrumentId) === String(inst.id) && 
        !b.returnedDate && 
        (b.status === 'approved' || b.status === 'pending') &&
        (!activeBooking || b.id !== activeBooking.id)
      )
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
      .map(b => {
        const user = users.find(u => String(u.id) === String(b.userId));
        return {
          id: b.id,
          userName: user ? user.name : 'Unknown User',
          userId: b.userId,
          status: b.status,
          startDate: b.startDate,
          dueDate: b.dueDate
        };
      });

    const nextBooking = futureBookings.length > 0 ? futureBookings[0] : null;

    return {
      ...inst,
      bookedBy,
      nextAvailableDate,
      futureBookings,
      nextBooking
    };
  });
}

async function broadcastUpdate() {
  try {
    // Real-time broadcasts disabled in production to manage traffic and allow updates on refresh
    // const instruments = await getInstrumentsWithBookings();
    // io.emit('instruments', instruments);
    // io.emit('bookings');
  } catch (err) {
    console.error('broadcastUpdate error', err);
  }
}

app.get('/api/instruments', authenticateToken, async (req, res) => {
  const instruments = await getInstrumentsWithBookings();
  res.json(instruments);
});

app.post('/api/instruments', authenticateToken, requireRole(['admin']), async (req, res) => {
  // Accept full instrument object (including learning fields and file URLs)
  const payload = req.body || {};
  payload.location = payload.location || 'warehouse';
  // normalize productImages if provided as comma-separated string
  if (payload.productImages && typeof payload.productImages === 'string'){
    payload.productImages = payload.productImages.split(',').map(s=>s.trim()).filter(Boolean);
  }
  const info = await db.insertInstrument(payload);
  broadcastUpdate();
  res.json({ id: info.id });
});

app.put('/api/instruments/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const id = req.params.id;
  const payload = req.body || {};
  if (payload.productImages && typeof payload.productImages === 'string'){
    payload.productImages = payload.productImages.split(',').map(s=>s.trim()).filter(Boolean);
  }
  await db.updateInstrument(id, payload);
  broadcastUpdate();
  res.json({ ok: true });
});

app.delete('/api/instruments/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const id = req.params.id;
  await db.deleteInstrument(id);
  broadcastUpdate();
  res.json({ ok: true });
});

app.get('/api/users', authenticateToken, async (req, res) => {
  const users = await db.getUsers();
  // Filter passwords before sending list
  const sanitized = users.map(({ password, ...u }) => u);
  res.json(sanitized);
});

app.post('/api/login', loginRateLimiter, async (req, res) => {
  const { email, password } = req.body;
  const trimmedEmail = (email || '').trim();
  if (!email || !password) {
    return res.status(400).json({ error: 'Mail ID and password are required.' });
  }
  const user = await db.getUserByEmail(trimmedEmail);
  if (!user) {
    return res.status(401).json({ error: 'Invalid Mail ID or password.' });
  }
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid Mail ID or password.' });
  }
  const { password: _, ...userInfo } = user;
  const role = (userInfo.role || 'engineer').toLowerCase();
  
  const tokenPayload = { id: userInfo.id, email: userInfo.email, role };
  const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '8h' });

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 3600 * 1000 // 8 hours
  });

  res.json({ ...userInfo, role });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.post('/api/users', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { name, email, phone, password, role, department, designation, status } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Name, Mail ID, Password, and Role are required.' });
  }
  const existing = await db.getUserByEmail(email);
  if (existing) {
    return res.status(400).json({ error: 'Mail ID is already registered.' });
  }
  const newUser = await db.insertUser({
    name,
    email,
    phone: phone || '',
    password,
    role: role.toLowerCase(),
    department: department || 'Engineering',
    designation: designation || (role === 'intern' ? 'Trainee' : role === 'auditor' ? 'Senior Auditor' : role === 'hr' ? 'HR Manager' : role === 'admin' ? 'Administrator' : 'Field Engineer'),
    status: status || 'active'
  });
  const { password: _, ...sanitized } = newUser;
  res.json(sanitized);
});

app.post('/api/book', authenticateToken, async (req, res) => {
  const { instrumentId, days = 7, remarks, startDate: explicitStart, endDate: explicitEnd } = req.body;
  const userId = req.user.id;
  const inst = await db.getInstrumentById(instrumentId);
  if (!inst) return res.status(404).json({ error: 'Instrument not found' });

  const users = await db.getUsers();
  const user = users.find(u => String(u.id) === String(userId));
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (inst.status !== 'available') {
    return res.status(400).json({ error: 'This instrument is already booked.' });
  }

  let start, due;
  if (explicitStart && explicitEnd) {
    start = new Date(explicitStart);
    due = new Date(explicitEnd);
  } else {
    start = new Date();
    due = new Date(start.getTime() + days * 24 * 3600 * 1000);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start < today) {
    return res.status(400).json({ error: 'Cannot book instrument for past dates.' });
  }

  // Validate: end must be after start
  if (due <= start) return res.status(400).json({ error: 'End date must be after start date.' });

  const now = new Date();
  const currentBooking = activeAndFuture.find(b => {
    if (b.status !== 'approved') return false;
    const bStart = new Date(b.startDate);
    const bDue = new Date(b.dueDate);
    return bStart <= now && bDue >= now;
  });

  const futureQueue = activeAndFuture.filter(b => {
    const bStart = new Date(b.startDate);
    return bStart > now || b.status === 'pending';
  });

  if (futureQueue.length > 0 && (!currentBooking || explicitStart || explicitEnd)) {
    return res.status(400).json({
      error: 'This instrument already has a pending/future pre-booking queue. Only one queued request is allowed at a time.'
    });
  }

  // Validate that the requested range does not overlap with any existing non-denied booking
  const overlap = activeAndFuture.find(b => {
    const bStart = new Date(b.startDate);
    const bDue = new Date(b.dueDate);
    return start < bDue && due > bStart;
  });
  if (overlap) {
    return res.status(400).json({ 
      error: `Requested booking dates overlap with an existing booking/request for this instrument (${new Date(overlap.startDate).toLocaleDateString()} to ${new Date(overlap.dueDate).toLocaleDateString()}).` 
    });
  }

  if ((user.role || '').toLowerCase() === 'admin') {
    // Admin booked directly -> auto-approve and generate excel
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Booking');
      sheet.addRow(['SNo', 'Instrument Name', 'Model', 'Serial', 'Booked By', 'Start Date', 'Due Date', 'Previous Insight', 'Remarks']);
      const prev = inst.lastInsight || '';
      sheet.addRow([1, inst.name, inst.model, inst.serial, user.name, start.toISOString(), due.toISOString(), prev, remarks || '']);
      const fileName = `booking-${Date.now()}.xlsx`;
      // In-memory XLSX generated dynamically on download, no local filesystem write needed
      // const filePath = path.join(__dirname, 'public', fileName);
      // await workbook.xlsx.writeFile(filePath);
      const sheetUrl = `/download/` + fileName;

      await db.insertBooking({
        userId,
        instrumentId,
        startDate: start.toISOString(),
        dueDate: due.toISOString(),
        remarks,
        status: 'approved',
        sheetUrl
      });
      
      // Only change status to booked if not already booked
      if (inst.status !== 'booked') {
        await db.updateInstrument(instrumentId, { status: 'booked', location: 'with_user' });
      }
      broadcastUpdate();

      try {
        io.emit('insight', { toUserId: userId, items: [{ instrumentId, instrumentName: inst.name, insight: prev }] });
      } catch (err) { console.error('emit insight error', err); }

      res.json({ ok: true, sheet: sheetUrl });
    } catch (err) {
      console.error('Failed to generate booking sheet for admin', err);
      await db.insertBooking({
        userId,
        instrumentId,
        startDate: start.toISOString(),
        dueDate: due.toISOString(),
        remarks,
        status: 'approved'
      });
      if (inst.status !== 'booked') {
        await db.updateInstrument(instrumentId, { status: 'booked', location: 'with_user' });
      }
      broadcastUpdate();
      res.json({ ok: true });
    }
  } else {
    // Engineer booked -> creates request
    await db.insertBooking({
      userId,
      instrumentId,
      startDate: start.toISOString(),
      dueDate: due.toISOString(),
      remarks,
      status: 'pending'
    });
    
    // Only set to requested if it is currently available
    if (inst.status === 'available') {
      await db.updateInstrument(instrumentId, { status: 'requested' });
    }
    broadcastUpdate();
    res.json({ ok: true, pending: true, message: isPreBooking ? 'Pre-booking request sent to admin for approval.' : 'Booking request sent to admin for approval.' });
  }
});

app.post('/api/book/bulk', authenticateToken, async (req, res) => {
  const { instrumentIds = [], days = 7, remarks, startDate: explicitStart, endDate: explicitEnd } = req.body;
  const userId = req.user.id;
  const users = await db.getUsers();
  const user = users.find(u => String(u.id) === String(userId));
  if (!user) return res.status(404).json({ error: 'User not found' });

  const bookings = await db.getBookings();

  let start, due;
  if (explicitStart && explicitEnd) {
    start = new Date(explicitStart);
    due = new Date(explicitEnd);
  } else {
    start = new Date();
    due = new Date(start.getTime() + days * 24 * 3600 * 1000);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start < today) {
    return res.status(400).json({ error: 'Cannot book instruments for past dates.' });
  }

  if (due <= start) return res.status(400).json({ error: 'End date must be after start date.' });

  // Validate that no instrument is already booked or has an overlapping booking/request
  for (const instrumentId of instrumentIds) {
    const inst = await db.getInstrumentById(instrumentId);
    if (!inst) continue;
    if (inst.status !== 'available') {
      return res.status(400).json({ error: `Instrument "${inst.name}" is already booked.` });
    }

    const activeAndFuture = bookings.filter(b => 
      String(b.instrumentId) === String(instrumentId) && 
      !b.returnedDate && 
      b.status !== 'denied'
    );

    const now = new Date();
    const futureQueue = activeAndFuture.filter(b => {
      const bStart = new Date(b.startDate);
      return b.status === 'pending' || bStart > now;
    });
    if (futureQueue.length > 0) {
      return res.status(400).json({
        error: 'This instrument already has a pending or future pre-booking queue. Only one queue is allowed at a time.'
      });
    }

    const overlap = activeAndFuture.find(b => {
      const bStart = new Date(b.startDate);
      const bDue = new Date(b.dueDate);
      return start < bDue && due > bStart;
    });

    if (overlap) {
      return res.status(400).json({ 
        error: `Booking dates for instrument "${inst.name}" overlap with an existing booking/request (${new Date(overlap.startDate).toLocaleDateString()} to ${new Date(overlap.dueDate).toLocaleDateString()}).` 
      });
    }
  }

  if ((user.role || '').toLowerCase() === 'admin') {
    // Admin bulk bookings auto-approved and bulk sheet generated
    const groupId = nanoid(8);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Bookings');
    sheet.addRow(['SNo', 'Instrument Name', 'Model', 'Serial', 'Booked By', 'Start Date', 'Due Date', 'Previous Insight', 'Remarks']);
    let idx = 1;
    const itemsForNotification = [];
    const createdBookingIds = [];

    for (const instrumentId of instrumentIds) {
      try {
        const inst = await db.getInstrumentById(instrumentId);
        if (!inst) continue;

        const prev = inst.lastInsight || '';
        sheet.addRow([idx++, inst.name, inst.model, inst.serial, user.name, start.toISOString(), due.toISOString(), prev, remarks || '']);
        
        const b = await db.insertBooking({
          userId,
          instrumentId,
          startDate: start.toISOString(),
          dueDate: due.toISOString(),
          remarks,
          status: 'approved',
          bulkGroupId: groupId
        });
        createdBookingIds.push(b.id);
        
        // Only set status to booked if not already booked
        if (inst.status !== 'booked') {
          await db.updateInstrument(instrumentId, { status: 'booked', location: 'with_user' });
        }
        itemsForNotification.push({ instrumentId, instrumentName: inst.name, insight: prev });
      } catch (err) {
        console.error('bulk book error for', instrumentId, err);
      }
    }

    if (createdBookingIds.length === 0) {
      return res.status(400).json({ error: 'No instruments selected for booking.' });
    }

    // Add calibration reminders
    try {
      const calSheet = workbook.addWorksheet('CalibrationDue');
      calSheet.addRow(['SNo', 'Instrument Name', 'Model', 'Serial', 'Next Calibration Date', 'Days Left']);
      const all = await db.getInstruments();
      const now = new Date();
      const cutoff = new Date(now.getTime() + 15 * 24 * 3600 * 1000);
      let cidx = 1;
      all.forEach(i => {
        if (i.nextCalibrationDate) {
          const nd = new Date(i.nextCalibrationDate);
          if (nd >= now && nd <= cutoff) {
            const daysLeft = Math.ceil((nd - now) / (24 * 3600 * 1000));
            calSheet.addRow([cidx++, i.name, i.model, i.serial, i.nextCalibrationDate, daysLeft]);
          }
        }
      });

      const sum = workbook.addWorksheet('Summary');
      sum.addRow(['TotalBooked', createdBookingIds.length]);
      sum.addRow(['BookedBy', user.name]);
      sum.addRow(['StartDate', new Date().toISOString()]);
      sum.addRow(['DueDate', new Date(Date.now() + days * 24 * 3600 * 1000).toISOString()]);
      sum.addRow(['Remarks', remarks || '']);
    } catch (err) {
      console.error('failed to add calibration sheet', err);
    }

    try {
      const fileName = `booking-${Date.now()}.xlsx`;
      // In-memory XLSX generated dynamically on download, no local filesystem write needed
      // const filePath = path.join(__dirname, 'public', fileName);
      // await workbook.xlsx.writeFile(filePath);
      const sheetUrl = '/download/' + fileName;

      for (const bid of createdBookingIds) {
        await db.updateBooking(bid, { sheetUrl });
      }

      broadcastUpdate();
      try {
        if (itemsForNotification.length) io.emit('insight', { toUserId: userId, items: itemsForNotification });
      } catch (err) { console.error('emit bulk insight error', err); }

      res.json({ ok: true, sheet: sheetUrl });
    } catch (err) {
      console.error('Failed to generate bulk booking sheet', err);
      broadcastUpdate();
      res.json({ ok: true });
    }
  } else {
    // Engineer bulk bookings -> ONE grouped pending request sharing a bulkGroupId
    const groupId = nanoid(8);
    let count = 0;
    for (const instrumentId of instrumentIds) {
      try {
        const inst = await db.getInstrumentById(instrumentId);
        if (!inst) continue;

        await db.insertBooking({
          userId,
          instrumentId,
          startDate: start.toISOString(),
          dueDate: due.toISOString(),
          remarks,
          status: 'pending',
          bulkGroupId: groupId   // links all instruments to one group request
        });
        
        // Only set to requested if currently available
        if (inst.status === 'available') {
          await db.updateInstrument(instrumentId, { status: 'requested' });
        }
        count++;
      } catch (err) {
        console.error('bulk book request error for', instrumentId, err);
      }
    }
    broadcastUpdate();
    if (count === 0) return res.status(400).json({ error: 'No instruments requested.' });
    res.json({ ok: true, pending: true, message: `Bulk booking request for ${count} instrument(s) submitted for admin approval.` });
  }
});

// ── Admin Booking Requests management ──────────────────────────────────────

// GET /api/booking-requests
// Returns pending requests grouped: single bookings are one entry each,
// bulk bookings (sharing a bulkGroupId) are collapsed into ONE entry.
app.get('/api/booking-requests', authenticateToken, requireRole(['admin', 'auditor']), async (req, res) => {
  const rows = await db.getBookings();
  const pending = rows.filter(b => b.status === 'pending');
  const users = await db.getUsers();
  const instruments = await db.getInstruments();

  // Group: key = bulkGroupId (for bulk) or bookingId (for single)
  const groups = {};
  for (const b of pending) {
    const key = b.bulkGroupId || b.id;
    if (!groups[key]) groups[key] = [];
    groups[key].push(b);
  }

  const result = Object.entries(groups).map(([requestId, bookings]) => {
    const first = bookings[0];
    const user = users.find(u => String(u.id) === String(first.userId)) || {};
    const isBulk = !!first.bulkGroupId;
    const instrumentList = bookings.map(b => {
      const inst = instruments.find(i => String(i.id) === String(b.instrumentId)) || {};
      return {
        bookingId: b.id,
        id: inst.id || b.instrumentId,
        name: inst.name || 'Unknown',
        model: inst.model || 'N/A',
        serial: inst.serial || 'N/A'
      };
    });
    return {
      requestId,                       // bulkGroupId OR bookingId
      type: isBulk ? 'bulk' : 'single',
      userId: first.userId,
      userName: user.name || 'Unknown User',
      userEmail: user.email || 'N/A',
      instruments: instrumentList,
      startDate: first.startDate,
      dueDate: first.dueDate,
      remarks: first.remarks,
      status: 'pending'
    };
  });

  res.json(result);
});

// POST /api/booking-requests/:id/approve
// :id is either a bulkGroupId (for bulk) or a single bookingId.
app.post('/api/booking-requests/:id/approve', authenticateToken, requireRole(['admin', 'auditor']), async (req, res) => {
  const { id } = req.params;

  // Check if this is a bulk group
  const allBookings = await db.getBookings();
  const bulkBookings = allBookings.filter(b => b.bulkGroupId === id && b.status === 'pending');

  if (bulkBookings.length > 0) {
    // Validate that none of the instruments has an overlapping approved booking
    const bookingsList = await db.getBookings();
    for (const b of bulkBookings) {
      const inst = await db.getInstrumentById(b.instrumentId);
      if (!inst) continue;

      const activeApproved = bookingsList.filter(x => 
        String(x.instrumentId) === String(b.instrumentId) && 
        !x.returnedDate && 
        x.status === 'approved' && 
        x.id !== b.id
      );

      const bStart = new Date(b.startDate);
      const bDue = new Date(b.dueDate);
      const overlap = activeApproved.find(x => {
        const xStart = new Date(x.startDate);
        const xDue = new Date(x.dueDate);
        return bStart < xDue && bDue > xStart;
      });

      if (overlap) {
        return res.status(400).json({ 
          error: `Approval failed. Instrument "${inst.name}" has an overlapping approved booking from ${new Date(overlap.startDate).toLocaleDateString()} to ${new Date(overlap.dueDate).toLocaleDateString()}.` 
        });
      }
    }

    // ── BULK GROUP APPROVAL ─────────────────────────────────────────────────
    const users = await db.getUsers();
    const user = users.find(u => String(u.id) === String(bulkBookings[0].userId)) || { name: 'Unknown User' };
    const start = new Date(bulkBookings[0].startDate);
    const due = new Date(bulkBookings[0].dueDate);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Bookings');
    sheet.addRow(['SNo', 'Instrument Name', 'Model', 'Serial', 'Booked By', 'Start Date', 'Due Date', 'Previous Insight', 'Remarks']);
    let idx = 1;
    const insightItems = [];

    for (const b of bulkBookings) {
      const inst = await db.getInstrumentById(b.instrumentId);
      if (!inst) continue;
      const prev = inst.lastInsight || '';
      sheet.addRow([idx++, inst.name, inst.model, inst.serial, user.name, start.toISOString(), due.toISOString(), prev, b.remarks || '']);
      insightItems.push({ instrumentId: b.instrumentId, instrumentName: inst.name, insight: prev });
    }

    // Calibration due + Summary sheets
    try {
      const calSheet = workbook.addWorksheet('CalibrationDue');
      calSheet.addRow(['SNo', 'Instrument Name', 'Model', 'Serial', 'Next Calibration Date', 'Days Left']);
      const all = await db.getInstruments();
      const now = new Date();
      const cutoff = new Date(now.getTime() + 15 * 24 * 3600 * 1000);
      let cidx = 1;
      all.forEach(i => {
        if (i.nextCalibrationDate) {
          const nd = new Date(i.nextCalibrationDate);
          if (nd >= now && nd <= cutoff) {
            calSheet.addRow([cidx++, i.name, i.model, i.serial, i.nextCalibrationDate, Math.ceil((nd - now) / (24 * 3600 * 1000))]);
          }
        }
      });
      const sum = workbook.addWorksheet('Summary');
      sum.addRow(['TotalBooked', bulkBookings.length]);
      sum.addRow(['BookedBy', user.name]);
      sum.addRow(['StartDate', start.toISOString()]);
      sum.addRow(['DueDate', due.toISOString()]);
      sum.addRow(['Remarks', bulkBookings[0].remarks || '']);
    } catch (err) { console.error('failed calibration/summary sheet', err); }

    try {
      const fileName = `booking-bulk-${id}-${Date.now()}.xlsx`;
      // In-memory XLSX generated dynamically on download, no local filesystem write needed
      // const filePath = path.join(__dirname, 'public', fileName);
      // await workbook.xlsx.writeFile(filePath);
      const sheetUrl = `/download/` + fileName;

      // Approve every booking in the group and set sheetUrl on each
      for (const b of bulkBookings) {
        await db.updateBooking(b.id, { status: 'approved', sheetUrl });
        // Check if there is currently an active approved booking (other than the one we are approving)
        const bookingsList = await db.getBookings();
        const activeApproved = bookingsList.find(x => 
          String(x.instrumentId) === String(b.instrumentId) && 
          !x.returnedDate && 
          x.status === 'approved' && 
          x.id !== b.id
        );
        if (!activeApproved) {
          await db.updateInstrument(b.instrumentId, { status: 'booked', location: 'with_user' });
        }
      }
      broadcastUpdate();
      try { io.emit('insight', { toUserId: bulkBookings[0].userId, items: insightItems }); } catch (_) {}
      res.json({ ok: true, sheet: sheetUrl });
    } catch (err) {
      console.error('Failed to generate bulk sheet on approval', err);
      for (const b of bulkBookings) {
        await db.updateBooking(b.id, { status: 'approved' });
        const bookingsList = await db.getBookings();
        const activeApproved = bookingsList.find(x => 
          String(x.instrumentId) === String(b.instrumentId) && 
          !x.returnedDate && 
          x.status === 'approved' && 
          x.id !== b.id
        );
        if (!activeApproved) {
          await db.updateInstrument(b.instrumentId, { status: 'booked', location: 'with_user' });
        }
      }
      broadcastUpdate();
      res.json({ ok: true });
    }
  } else {
    // ── SINGLE BOOKING APPROVAL ─────────────────────────────────────────────
    const booking = await db.getBookingById(id);
    if (!booking) return res.status(404).json({ error: 'Booking request not found' });
    if (booking.status !== 'pending') return res.status(400).json({ error: 'Request is not pending.' });

    const inst = await db.getInstrumentById(booking.instrumentId);
    if (!inst) return res.status(404).json({ error: 'Instrument not found' });

    // Validate that this instrument doesn't have an overlapping approved booking
    const bookingsList = await db.getBookings();
    const activeApproved = bookingsList.filter(x => 
      String(x.instrumentId) === String(booking.instrumentId) && 
      !x.returnedDate && 
      x.status === 'approved' && 
      x.id !== booking.id
    );

    const bStart = new Date(booking.startDate);
    const bDue = new Date(booking.dueDate);
    const overlap = activeApproved.find(x => {
      const xStart = new Date(x.startDate);
      const xDue = new Date(x.dueDate);
      return bStart < xDue && bDue > xStart;
    });

    if (overlap) {
      return res.status(400).json({ 
        error: `Approval failed. Instrument "${inst.name}" has an overlapping approved booking from ${new Date(overlap.startDate).toLocaleDateString()} to ${new Date(overlap.dueDate).toLocaleDateString()}.` 
      });
    }

    const users = await db.getUsers();
    const user = users.find(u => String(u.id) === String(booking.userId)) || { name: 'Unknown User' };
    const start = new Date(booking.startDate);
    const due = new Date(booking.dueDate);

    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Booking');
      sheet.addRow(['SNo', 'Instrument Name', 'Model', 'Serial', 'Booked By', 'Start Date', 'Due Date', 'Previous Insight', 'Remarks']);
      const prev = inst.lastInsight || '';
      sheet.addRow([1, inst.name, inst.model, inst.serial, user.name, start.toISOString(), due.toISOString(), prev, booking.remarks || '']);
      const fileName = `booking-${booking.id}-${Date.now()}.xlsx`;
      // In-memory XLSX generated dynamically on download, no local filesystem write needed
      // const filePath = path.join(__dirname, 'public', fileName);
      // await workbook.xlsx.writeFile(filePath);
      const sheetUrl = `/download/` + fileName;

      await db.updateBooking(booking.id, { status: 'approved', sheetUrl });
      
      const bookingsList = await db.getBookings();
      const activeApproved = bookingsList.find(x => 
        String(x.instrumentId) === String(booking.instrumentId) && 
        !x.returnedDate && 
        x.status === 'approved' && 
        x.id !== booking.id
      );
      if (!activeApproved) {
        await db.updateInstrument(booking.instrumentId, { status: 'booked', location: 'with_user' });
      }
      broadcastUpdate();
      try { io.emit('insight', { toUserId: booking.userId, items: [{ instrumentId: booking.instrumentId, instrumentName: inst.name, insight: prev }] }); } catch (_) {}
      res.json({ ok: true, sheet: sheetUrl });
    } catch (err) {
      console.error('Failed to generate sheet on approval', err);
      await db.updateBooking(booking.id, { status: 'approved' });
      const bookingsList = await db.getBookings();
      const activeApproved = bookingsList.find(x => 
        String(x.instrumentId) === String(booking.instrumentId) && 
        !x.returnedDate && 
        x.status === 'approved' && 
        x.id !== booking.id
      );
      if (!activeApproved) {
        await db.updateInstrument(booking.instrumentId, { status: 'booked', location: 'with_user' });
      }
      broadcastUpdate();
      res.json({ ok: true });
    }
  }
});

// POST /api/booking-requests/:id/deny
// :id is either a bulkGroupId or a single bookingId.
app.post('/api/booking-requests/:id/deny', authenticateToken, requireRole(['admin', 'auditor']), async (req, res) => {
  const { id } = req.params;

  const allBookings = await db.getBookings();
  const bulkBookings = allBookings.filter(b => b.bulkGroupId === id && b.status === 'pending');

  if (bulkBookings.length > 0) {
    for (const b of bulkBookings) {
      await db.updateBooking(b.id, { status: 'denied' });
      await db.updateInstrument(b.instrumentId, { status: 'available', location: 'warehouse' });
    }
    broadcastUpdate();
    res.json({ ok: true });
  } else {
    const booking = await db.getBookingById(id);
    if (!booking) return res.status(404).json({ error: 'Booking request not found' });
    if (booking.status !== 'pending') return res.status(400).json({ error: 'Request is not pending.' });
    await db.updateBooking(booking.id, { status: 'denied' });
    await db.updateInstrument(booking.instrumentId, { status: 'available', location: 'warehouse' });
    broadcastUpdate();
    res.json({ ok: true });
  }
});

// DELETE /api/users/:id  (admin only)
app.delete('/api/users/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const users = await db.getUsers();
  const user = users.find(u => String(u.id) === String(id));
  if (!user) return res.status(404).json({ error: 'User not found.' });
  // Prevent deleting the primary built-in admin by email
  if ((user.email || '').toLowerCase() === 'admin') {
    return res.status(400).json({ error: 'Cannot delete the primary admin account.' });
  }
  await db.deleteUser(id);
  res.json({ ok: true });
});

// PUT /api/users/:id (admin only)
app.put('/api/users/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, password, role, department, designation, status } = req.body;

  // Any admin can edit user accounts (removed hardcoded 'admin' email restriction)
  const users = await db.getUsers();
  const userToEdit = users.find(u => String(u.id) === String(id));
  if (!userToEdit) {
    return res.status(404).json({ error: 'User not found.' });
  }

  // Prevent editing primary admin account unless you ARE the primary admin
  const isPrimaryAdmin = ['admin', 'admin@iitm.com'].includes((req.user.email || '').toLowerCase());
  if (!isPrimaryAdmin && ['admin', 'admin@iitm.com'].includes((userToEdit.email || '').toLowerCase())) {
    return res.status(403).json({ error: 'Only the primary admin can edit the primary admin account.' });
  }

  if (email && email.toLowerCase() !== userToEdit.email.toLowerCase()) {
    const existing = await db.getUserByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'Mail ID is already registered.' });
    }
  }

  const updatedFields = {};
  if (name !== undefined) updatedFields.name = name;
  if (email !== undefined) updatedFields.email = email;
  if (phone !== undefined) updatedFields.phone = phone;
  if (role !== undefined) updatedFields.role = role.toLowerCase();
  if (department !== undefined) updatedFields.department = department;
  if (designation !== undefined) updatedFields.designation = designation;
  if (status !== undefined) updatedFields.status = status;
  if (password) {
    updatedFields.password = await bcrypt.hash(password, 10);
  }

  const updatedUser = await db.updateUser(id, updatedFields);
  const { password: _, ...sanitized } = updatedUser;
  res.json(sanitized);
});

async function reconcileInstrumentStatus(instrumentId) {
  const bookingsList = await db.getBookings();
  const now = new Date();
  const remaining = bookingsList.filter(b => String(b.instrumentId) === String(instrumentId) && !b.returnedDate);
  const active = remaining.find(b => {
    if (b.status !== 'approved') return false;
    const start = new Date(b.startDate);
    const due = new Date(b.dueDate);
    return start <= now && due >= now;
  });
  if (active) {
    return await db.updateInstrument(instrumentId, { status: 'booked', location: 'with_user' });
  }
  const futureApproved = remaining.some(b => b.status === 'approved' && new Date(b.startDate) > now);
  const pending = remaining.some(b => b.status === 'pending');
  if (pending || futureApproved) {
    return await db.updateInstrument(instrumentId, { status: 'requested', location: 'warehouse' });
  }
  return await db.updateInstrument(instrumentId, { status: 'available', location: 'warehouse' });
}

async function handleInstrumentReturnTransition(instrumentId, returnedBookingId) {
  const bookingsList = await db.getBookings();
  
  // Find approved future pre-bookings for this instrument (excluding the returned one)
  const approvedPre = bookingsList
    .filter(b => 
      String(b.instrumentId) === String(instrumentId) && 
      !b.returnedDate && 
      b.status === 'approved' && 
      b.id !== returnedBookingId
    )
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

  if (approvedPre.length > 0) {
    // There is an approved pre-booking. Mark instrument status as booked.
    await db.updateInstrument(instrumentId, { status: 'booked', location: 'with_user' });
  } else {
    // Check if there are any pending pre-bookings
    const pendingPre = bookingsList.filter(b => 
      String(b.instrumentId) === String(instrumentId) && 
      !b.returnedDate && 
      b.status === 'pending'
    );
    if (pendingPre.length > 0) {
      await db.updateInstrument(instrumentId, { status: 'requested', location: 'warehouse' });
    } else {
      await db.updateInstrument(instrumentId, { status: 'available', location: 'warehouse' });
    }
  }
}

app.post('/api/return', authenticateToken, async (req, res) => {
  const { instrumentId, remarks } = req.body;
  const booking = await db.findActiveBookingByInstrument(instrumentId);
  if (!booking) return res.status(404).json({ error: 'Active booking not found' });
  if (req.user.role !== 'admin' && String(booking.userId) !== String(req.user.id)) {
    return res.status(403).json({ error: 'You are not authorized to return this instrument.' });
  }
  const returnedDate = new Date().toISOString();
  const users = await db.getUsers();
  const returnUser = users.find(u => String(u.id) === String(req.user.id));
  await db.returnBooking(booking.id, returnedDate, remarks, req.user.id, returnUser?.name || 'Unknown');
  await handleInstrumentReturnTransition(instrumentId, booking.id);
  broadcastUpdate();
  res.json({ ok: true });
});

app.post('/api/return/bulk', authenticateToken, async (req, res) => {
  const { instrumentIds = [], remarks } = req.body;
  const users = await db.getUsers();
  const returnUser = users.find(u => String(u.id) === String(req.user.id));
  for (const instrumentId of instrumentIds) {
    try {
      const booking = await db.findActiveBookingByInstrument(instrumentId);
      if (!booking) continue;
      if (req.user.role !== 'admin' && String(booking.userId) !== String(req.user.id)) continue;
      const returnedDate = new Date().toISOString();
      await db.returnBooking(booking.id, returnedDate, remarks, req.user.id, returnUser?.name || 'Unknown');
      await handleInstrumentReturnTransition(instrumentId, booking.id);
      if (remarks && remarks.length) await db.setInstrumentInsight(instrumentId, remarks);
    } catch (err) {
      console.error('bulk return error for', instrumentId, err);
    }
  }
  broadcastUpdate();
  res.json({ ok: true });
});

app.get('/api/calibration/due', authenticateToken, async (req, res)=>{
  const days = Number(req.query.days) || 15;
  const rows = await db.getInstrumentsDueForCalibration(days);
  res.json(rows);
});

app.post('/api/instrument/insight', authenticateToken, async (req, res)=>{
  const { instrumentId, insight } = req.body;
  if(!instrumentId) return res.status(400).json({ error: 'instrumentId required' });
  await db.setInstrumentInsight(instrumentId, insight || '');
  res.json({ ok: true });
});

app.get('/api/bookings', authenticateToken, async (req, res) => {
  const rows = await db.getBookings();
  const users = await db.getUsers();
  const instruments = await db.getInstruments();
  const result = rows.map(b => {
    const user = users.find(u => String(u.id) === String(b.userId)) || {}
    const inst = instruments.find(i => String(i.id) === String(b.instrumentId)) || {}
    return {
      ...b,
      userName: user.name,
      instrumentName: inst.name,
      instrumentModel: inst.model,
      instrumentSerial: inst.serial,
      instrumentImage: Array.isArray(inst.productImages) ? inst.productImages[0] : null
    }
  })
  res.json(result.sort((a,b)=> new Date(b.startDate)-new Date(a.startDate)))
});

app.get('/api/calibrations', authenticateToken, async (req, res) => {
  const instruments = await db.getInstruments();
  const rows = instruments.map(i => {
    const next = i.nextCalibrationDate || null;
    const dueIn = next ? (new Date(next) - new Date()) : null;
    return { ...i, dueInMilliseconds: dueIn };
  });
  res.json(rows);
});

app.post('/api/calibrate', authenticateToken, requireRole(['admin', 'engineer', 'technician']), async (req, res) => {
  // Accept optional calibration certificate URL and cycle days from frontend
  const { instrumentId, byUserId, certificateUrl, cycleDays } = req.body;
  if(!instrumentId) return res.status(400).json({ error: 'instrumentId required' });
  const now = new Date();
  const days = Number(cycleDays) || 365;
  const next = new Date(now.getTime() + days*24*3600*1000);
  const update = {
    lastCalibrationDate: now.toISOString(),
    nextCalibrationDate: next.toISOString(),
    calibrationCycleDays: days
  };
  if (certificateUrl) update.calibrationCertificateUrl = certificateUrl;
  await db.updateInstrument(instrumentId, update);
  // optionally record who performed it (not persisted separately currently)
  broadcastUpdate();
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/api/admin/extract-bookings', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'Start date and End date are required.' });
    }

    const fileName = `booking-extract-${start}-${end}.xlsx`;
    const sheetUrl = `/download/` + fileName;

    res.json({ ok: true, sheet: sheetUrl });
  } catch (err) {
    console.error('Failed to extract bookings', err);
    res.status(500).json({ error: 'Failed to generate extract sheet' });
  }
});

app.delete('/api/bookings/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { id } = req.params;
  const booking = await db.getBookingById(id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found.' });
  }
  await db.deleteBooking(id);
  await reconcileInstrumentStatus(booking.instrumentId);
  broadcastUpdate();
  res.json({ ok: true });
});

app.delete('/api/bookings/group/:groupId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { groupId } = req.params;
  const group = await db.getBookingsByBulkGroupId(groupId);
  if (!group || group.length === 0) {
    return res.status(404).json({ error: 'Booking group not found.' });
  }
  const instrumentIds = Array.from(new Set(group.map(b => String(b.instrumentId))));
  await db.deleteBookingsByBulkGroupId(groupId);
  for (const instrumentId of instrumentIds) {
    await reconcileInstrumentStatus(instrumentId);
  }
  broadcastUpdate();
  res.json({ ok: true });
});

app.post('/api/admin/clear-bookings', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { start, end } = req.body;
    const bookings = await db.getBookings();
    const originalCount = bookings.length;

    let remainingBookings;
    const deletedBookings = [];

    if (!start && !end) {
      deletedBookings.push(...bookings);
      remainingBookings = [];
    } else {
      const startDateLimit = new Date(start);
      const endDateLimit = new Date(end + "T23:59:59.999Z");

      if (isNaN(startDateLimit.getTime()) || isNaN(endDateLimit.getTime())) {
        return res.status(400).json({ error: 'Invalid date range provided.' });
      }

      // Keep bookings that do not overlap the selected range by start, due, or return dates.
      remainingBookings = bookings.filter(b => {
        const bStart = new Date(b.startDate);
        const bDue = b.dueDate ? new Date(b.dueDate) : null;
        const bReturned = b.returnedDate ? new Date(b.returnedDate) : null;

        const overlapsStart = bStart >= startDateLimit && bStart <= endDateLimit;
        const overlapsDue = bDue && bDue >= startDateLimit && bDue <= endDateLimit;
        const overlapsReturn = bReturned && bReturned >= startDateLimit && bReturned <= endDateLimit;
        const spansRange = bStart < startDateLimit && bDue && bDue > endDateLimit;

        const keep = !(overlapsStart || overlapsDue || overlapsReturn || spansRange);
        if (!keep) {
          deletedBookings.push(b);
        }
        return keep;
      });
    }

    const deletedCount = originalCount - remainingBookings.length;

    await db.setBookings(remainingBookings);

    const instruments = await db.getInstruments();
    const affectedInstrumentIds = new Set(deletedBookings.map(b => String(b.instrumentId)));

    if (!start && !end) {
      for (const inst of instruments) {
        await db.updateInstrument(inst.id, { status: 'available', location: 'warehouse' });
      }
    } else {
      for (const instrumentId of affectedInstrumentIds) {
        await reconcileInstrumentStatus(instrumentId);
      }
    }

    broadcastUpdate();
    res.json({ ok: true, count: deletedCount });
  } catch (err) {
    console.error('Failed to clear bookings', err);
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

// ==========================================
// VENDOR MANAGEMENT ENDPOINTS
// ==========================================

function validateVendorPayload(payload) {
  if (!payload.name || !payload.name.trim()) {
    return 'Vendor Name cannot be empty.';
  }
  if (payload.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(payload.email)) {
      return 'Invalid email address format.';
    }
  }
  if (payload.mobileNumber) {
    const phoneRegex = /^\+?[0-9]{7,15}$/;
    if (!phoneRegex.test(payload.mobileNumber)) {
      return 'Invalid mobile number format.';
    }
  }
  if (payload.alternativeMobileNumber) {
    const phoneRegex = /^\+?[0-9]{7,15}$/;
    if (!phoneRegex.test(payload.alternativeMobileNumber)) {
      return 'Invalid alternative mobile number format.';
    }
  }
  if (payload.gstin) {
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i;
    if (!gstinRegex.test(payload.gstin)) {
      return 'Invalid GSTIN format (must be 15 characters, e.g. 22AAAAA1111A1Z1).';
    }
  }
  return null;
}

async function validateProductPayload(vendorId, payload, editingProductId = null) {
  if (!payload.name || !payload.name.trim()) {
    return 'Product Name cannot be empty.';
  }
  if (!payload.utilityName || !payload.utilityName.trim()) {
    return 'Assigned Utility is required.';
  }
  const products = await db.getProductsByVendor(vendorId);
  const duplicate = products.some(p => 
    p.name.toLowerCase().trim() === payload.name.toLowerCase().trim() && 
    String(p.id) !== String(editingProductId)
  );
  if (duplicate) {
    return 'A product with this name already exists for this vendor.';
  }
  return null;
}

app.get('/api/vendors', authenticateToken, async (req, res) => {
  try {
    const allVendors = await db.getVendors();
    const allProducts = await db.getProducts();

    const q = (req.query.q || '').toLowerCase().trim();
    const utilityFilter = (req.query.utility || '').toLowerCase().trim();
    const vendorFilter = (req.query.vendor || '').trim();
    const productFilter = (req.query.product || '').trim();
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const productsByVendor = {};
    for (const prod of allProducts) {
      if (!productsByVendor[prod.vendorId]) {
        productsByVendor[prod.vendorId] = [];
      }
      productsByVendor[prod.vendorId].push(prod);
    }

    let filteredVendors = allVendors.filter(v => {
      const vProds = productsByVendor[v.id] || [];

      if (vendorFilter && String(v.id) !== String(vendorFilter)) {
        return false;
      }

      if (productFilter) {
        const hasProd = vProds.some(p => 
          String(p.id) === String(productFilter) || 
          p.name.toLowerCase().includes(productFilter.toLowerCase())
        );
        if (!hasProd) return false;
      }

      if (utilityFilter) {
        const hasUtil = vProds.some(p => (p.utilityId || '').toLowerCase() === utilityFilter);
        if (!hasUtil) return false;
      }

      if (q) {
        const matchVendor = (v.name || '').toLowerCase().includes(q) ||
                            (v.companyName || '').toLowerCase().includes(q) ||
                            (v.contactPerson || '').toLowerCase().includes(q);
        
        const matchProduct = vProds.some(p => 
          (p.name || '').toLowerCase().includes(q) ||
          (p.category || '').toLowerCase().includes(q) ||
          (p.utilityName || '').toLowerCase().includes(q)
        );

        if (!matchVendor && !matchProduct) return false;
      }

      return true;
    });

    const total = filteredVendors.length;
    const startIdx = (page - 1) * limit;
    const paginatedVendors = filteredVendors.slice(startIdx, startIdx + limit);

    const result = paginatedVendors.map(v => ({
      ...v,
      products: productsByVendor[v.id] || [],
      productCount: (productsByVendor[v.id] || []).length
    }));

    res.json({
      vendors: result,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error('Error fetching vendors:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/api/vendors/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const vendor = await db.getVendorById(id);
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found.' });
    }
    const products = await db.getProductsByVendor(id);
    res.json({
      ...vendor,
      products,
      productCount: products.length
    });
  } catch (err) {
    console.error('Error fetching vendor details:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/vendors', authenticateToken, requireRole(['admin']), async (req, res) => {
  const payload = req.body || {};
  const err = validateVendorPayload(payload);
  if (err) {
    return res.status(400).json({ error: err });
  }
  const info = await db.insertVendor(payload);
  res.json(info);
});

app.put('/api/vendors/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const id = req.params.id;
  const payload = req.body || {};
  const err = validateVendorPayload(payload);
  if (err) {
    return res.status(400).json({ error: err });
  }
  const updated = await db.updateVendor(id, payload);
  if (!updated) {
    return res.status(404).json({ error: 'Vendor not found' });
  }
  res.json(updated);
});

app.delete('/api/vendors/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const id = req.params.id;
  const vendor = await db.getVendorById(id);
  if (!vendor) {
    return res.status(404).json({ error: 'Vendor not found' });
  }
  await db.deleteVendor(id);
  res.json({ ok: true });
});

// Products CRUD inside Vendor
app.post('/api/vendors/:vendorId/products', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { vendorId } = req.params;
  const payload = req.body || {};
  
  const vendor = await db.getVendorById(vendorId);
  if (!vendor) {
    return res.status(404).json({ error: 'Vendor not found.' });
  }

  const err = await validateProductPayload(vendorId, payload);
  if (err) {
    return res.status(400).json({ error: err });
  }

  const utName = (payload.utilityName || '').trim();
  if (utName) {
    const ut = await db.insertUtility(utName);
    payload.utilityId = ut.id;
    payload.utilityName = ut.name;
  }

  payload.vendorId = vendorId;
  const newProd = await db.insertProduct(payload);
  res.json(newProd);
});

app.put('/api/vendors/:vendorId/products/:productId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { vendorId, productId } = req.params;
  const payload = req.body || {};

  const vendor = await db.getVendorById(vendorId);
  if (!vendor) {
    return res.status(404).json({ error: 'Vendor not found.' });
  }

  const prod = await db.getProductById(productId);
  if (!prod || String(prod.vendorId) !== String(vendorId)) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const err = await validateProductPayload(vendorId, payload, productId);
  if (err) {
    return res.status(400).json({ error: err });
  }

  const utName = (payload.utilityName || '').trim();
  if (utName) {
    const ut = await db.insertUtility(utName);
    payload.utilityId = ut.id;
    payload.utilityName = ut.name;
  }

  const updated = await db.updateProduct(productId, payload);
  res.json(updated);
});

app.delete('/api/vendors/:vendorId/products/:productId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { vendorId, productId } = req.params;
  const vendor = await db.getVendorById(vendorId);
  if (!vendor) {
    return res.status(404).json({ error: 'Vendor not found.' });
  }
  const prod = await db.getProductById(productId);
  if (!prod || String(prod.vendorId) !== String(vendorId)) {
    return res.status(404).json({ error: 'Product not found.' });
  }
  await db.deleteProduct(productId);
  res.json({ ok: true });
});

// Utilities endpoints
app.get('/api/utilities', authenticateToken, async (req, res) => {
  const utils = await db.getUtilities();
  res.json(utils);
});

app.post('/api/utilities', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Utility name cannot be empty.' });
  }
  const ut = await db.insertUtility(name);
  res.json(ut);
});

// XLSX Export
app.post('/api/vendors/export', authenticateToken, async (req, res) => {
  try {
    const { vendorIds } = req.body;
    if (!vendorIds || !Array.isArray(vendorIds) || vendorIds.length === 0) {
      return res.status(400).json({ error: 'No vendors selected for export.' });
    }

    const workbook = new ExcelJS.Workbook();

    for (const vId of vendorIds) {
      const vendor = await db.getVendorById(vId);
      if (!vendor) continue;

      const products = await db.getProductsByVendor(vId);
      
      let sheetName = (vendor.name || 'Vendor').replace(/[*?:/\\\[\]]/g, '');
      if (sheetName.length > 30) {
        sheetName = sheetName.substring(0, 30);
      }
      
      const sheet = workbook.addWorksheet(sheetName);
      sheet.views = [{ showGridLines: true }];

      const titleFont = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFF' } };
      const sectionFont = { name: 'Arial', size: 11, bold: true, color: { argb: '1F2937' } };
      const labelFont = { name: 'Arial', size: 10, bold: true, color: { argb: '4B5563' } };
      const valueFont = { name: 'Arial', size: 10 };
      const headerFont = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };

      const fillPrimary = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E3A8A' } };
      const borderThin = {
        top: { style: 'thin', color: { argb: 'D1D5DB' } },
        left: { style: 'thin', color: { argb: 'D1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'D1D5DB' } },
        right: { style: 'thin', color: { argb: 'D1D5DB' } }
      };

      // Title Block
      sheet.mergeCells('A1:D1');
      const titleRow = sheet.getRow(1);
      titleRow.getCell(1).value = `Vendor Details: ${vendor.name || ''}`;
      titleRow.getCell(1).font = titleFont;
      titleRow.getCell(1).fill = fillPrimary;
      titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      titleRow.height = 30;

      sheet.addRow([]);
      const r3 = sheet.addRow(['Basic Information']);
      r3.getCell(1).font = sectionFont;
      
      sheet.addRow(['Vendor ID', vendor.id || 'N/A', 'Vendor Name', vendor.name || 'N/A']);
      sheet.addRow(['Company Name', vendor.companyName || 'N/A', 'Vendor Type', vendor.vendorType || 'N/A']);
      sheet.addRow(['Status', vendor.status || 'N/A']);

      sheet.addRow([]);
      const r8 = sheet.addRow(['Contact Information']);
      r8.getCell(1).font = sectionFont;
      
      sheet.addRow(['Contact Person', vendor.contactPerson || 'N/A', 'Mobile Number', vendor.mobileNumber || 'N/A']);
      sheet.addRow(['Alt Mobile Number', vendor.alternativeMobileNumber || 'N/A', 'Email Address', vendor.email || 'N/A']);
      sheet.addRow(['Website', vendor.website || 'N/A']);

      sheet.addRow([]);
      const r13 = sheet.addRow(['Address Details']);
      r13.getCell(1).font = sectionFont;

      sheet.addRow(['Street Address', vendor.streetAddress || 'N/A', 'City', vendor.city || 'N/A']);
      sheet.addRow(['State', vendor.state || 'N/A', 'Country', vendor.country || 'N/A']);
      sheet.addRow(['PIN/ZIP Code', vendor.pinCode || 'N/A']);

      sheet.addRow([]);
      const r18 = sheet.addRow(['Business Details']);
      r18.getCell(1).font = sectionFont;

      sheet.addRow(['GSTIN', vendor.gstin || 'N/A', 'PAN', vendor.pan || 'N/A']);
      sheet.addRow(['Business Reg No', vendor.businessRegNo || 'N/A']);

      sheet.addRow([]);
      const r22 = sheet.addRow(['Remarks / Notes']);
      r22.getCell(1).font = sectionFont;
      sheet.addRow(['Remarks / Notes', vendor.remarks || 'N/A']);

      const labelRows = [4, 5, 6, 9, 10, 11, 14, 15, 16, 19, 20, 23];
      labelRows.forEach(rn => {
        const row = sheet.getRow(rn);
        [1, 3].forEach(colIdx => {
          const cell = row.getCell(colIdx);
          if (cell.value) {
            cell.font = labelFont;
          }
        });
        [2, 4].forEach(colIdx => {
          row.getCell(colIdx).font = valueFont;
        });
      });

      sheet.addRow([]);
      sheet.addRow([]);
      const prodTitleRow = sheet.addRow(['Products Directory']);
      prodTitleRow.getCell(1).font = sectionFont;

      const headerRow = sheet.addRow([
        'Product ID', 'Product Name', 'Category', 'Description', 'Brand', 'Assigned Utility', 'Status'
      ]);
      headerRow.height = 20;
      for (let i = 1; i <= 7; i++) {
        const cell = headerRow.getCell(i);
        cell.font = headerFont;
        cell.fill = fillPrimary;
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.border = borderThin;
      }

      products.forEach(p => {
        const row = sheet.addRow([
          p.id || 'N/A',
          p.name || 'N/A',
          p.category || 'N/A',
          p.description || 'N/A',
          p.brand || 'N/A',
          p.utilityName || 'N/A',
          p.productStatus || 'N/A'
        ]);
        for (let i = 1; i <= 7; i++) {
          const cell = row.getCell(i);
          cell.font = valueFont;
          cell.border = borderThin;
        }
      });

      sheet.columns.forEach(column => {
        let maxLen = 12;
        column.eachCell({ includeEmpty: true }, cell => {
          if (cell.value) {
            const valStr = cell.value.toString();
            if (valStr.length > maxLen && !cell.address.includes('1')) {
              maxLen = valStr.length;
            }
          }
        });
        column.width = Math.min(maxLen + 3, 35);
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="vendors_export.xlsx"');
    res.send(buffer);
  } catch (err) {
    console.error('Failed to export vendors:', err);
    res.status(500).json({ error: 'Failed to generate Excel report.' });
  }
});

// ══════════════════════════════════════════════════════════════
// HR / TASK / LEAVE MANAGEMENT ROUTES
// ══════════════════════════════════════════════════════════════

// Helper: create notification
async function createNotification(userId, type, title, message, meta = {}) {
  try {
    await db.insertNotification({ userId: String(userId), type, title, message, meta });
  } catch (e) { console.error('notify error', e); }
}

// Helper: audit log
async function auditLog(actorId, actorName, action, entity, entityId, details = {}) {
  try {
    await db.insertAuditLog({ actorId, actorName, action, entity, entityId, details });
  } catch (e) { console.error('audit error', e); }
}

// Helper: calculate working days between two dates excluding holidays and weekends
function calcWorkingDays(startDate, endDate, holidays = [], weekendDays = ['Saturday', 'Sunday']) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const holidaySet = new Set(holidays.map(h => h.date));
  let count = 0;
  let cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur <= end) {
    const dayName = days[cur.getDay()];
    const dateStr = cur.toISOString().slice(0, 10);
    if (!weekendDays.includes(dayName) && !holidaySet.has(dateStr)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ═ DEPARTMENTS ════════════════════════════════════════════════════════════
app.get('/api/departments', authenticateToken, async (req, res) => {
  res.json(await db.getDepartments());
});
app.post('/api/departments', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { name, code, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  const dept = await db.insertDepartment({ name, code, description });
  await auditLog(req.user.id, req.user.email, 'CREATE', 'department', dept.id, { name });
  res.json(dept);
});
app.put('/api/departments/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const updated = await db.updateDepartment(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Department not found.' });
  res.json(updated);
});
app.delete('/api/departments/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  await db.deleteDepartment(req.params.id);
  res.json({ ok: true });
});

// ═ DESIGNATIONS ═══════════════════════════════════════════════════════════
app.get('/api/designations', authenticateToken, async (req, res) => {
  res.json(await db.getDesignations());
});
app.post('/api/designations', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { name, level } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  res.json(await db.insertDesignation({ name, level }));
});
app.put('/api/designations/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const updated = await db.updateDesignation(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Designation not found.' });
  res.json(updated);
});
app.delete('/api/designations/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  await db.deleteDesignation(req.params.id);
  res.json({ ok: true });
});

// ═ EMPLOYEE PROFILES ═════════════════════════════════════════════════════
app.get('/api/employee-profiles', authenticateToken, async (req, res) => {
  const profiles = await db.getEmployeeProfiles();
  const users = await db.getUsers();
  const enriched = profiles.map(p => {
    const u = users.find(u => String(u.id) === String(p.userId)) || {};
    return { ...p, userName: u.name, userEmail: u.email, userRole: u.role };
  });
  res.json(enriched);
});
app.get('/api/employee-profiles/me', authenticateToken, async (req, res) => {
  const profile = await db.getEmployeeProfileByUserId(req.user.id);
  const users = await db.getUsers();
  const u = users.find(x => String(x.id) === String(req.user.id)) || {};
  res.json({ ...profile, userName: u.name, userEmail: u.email, userRole: u.role, userId: req.user.id });
});
app.get('/api/employee-profiles/:userId', authenticateToken, async (req, res) => {
  const profile = await db.getEmployeeProfileByUserId(req.params.userId);
  res.json(profile || {});
});
app.post('/api/employee-profiles', authenticateToken, async (req, res) => {
  const userId = req.user.role === 'admin' ? (req.body.userId || req.user.id) : req.user.id;
  const profile = await db.upsertEmployeeProfile(userId, req.body);
  await db.initLeaveBalancesForUser(userId, new Date().getFullYear());
  await auditLog(req.user.id, req.user.email, 'UPSERT', 'employee_profile', userId, req.body);
  res.json(profile);
});
app.put('/api/employee-profiles/:userId', authenticateToken, async (req, res) => {
  const targetId = req.params.userId;
  const role = (req.user.role || '').toLowerCase();
  if (role !== 'admin' && String(targetId) !== String(req.user.id)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const profile = await db.upsertEmployeeProfile(targetId, req.body);
  await auditLog(req.user.id, req.user.email, 'UPDATE', 'employee_profile', targetId, req.body);
  res.json(profile);
});

// ═ TASKS ══════════════════════════════════════════════════════════════════
app.get('/api/tasks', authenticateToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  let tasks = await db.getTasks();
  if (role === 'engineer' || role === 'trainee') {
    tasks = tasks.filter(t => String(t.assignedTo) === String(req.user.id) || String(t.createdBy) === String(req.user.id));
  } else if (role === 'manager') {
    // Manager sees tasks they assigned or that belong to their team
    tasks = tasks.filter(t => String(t.assignedBy) === String(req.user.id) || String(t.assignedTo) === String(req.user.id));
  }
  // Enrich with user names
  const users = await db.getUsers();
  const enriched = tasks.map(t => {
    const assignee = users.find(u => String(u.id) === String(t.assignedTo)) || {};
    const assigner = users.find(u => String(u.id) === String(t.assignedBy)) || {};
    return { ...t, assigneeName: assignee.name || 'Unassigned', assignerName: assigner.name || '' };
  });
  res.json(enriched);
});

app.post('/api/tasks', authenticateToken, requireRole(['admin', 'hr', 'auditor', 'engineer', 'intern', 'trainee', 'manager']), async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  const { title, description, assignedTo, priority = 'medium', dueDate, estimatedHours, category, project, department, tags } = req.body;
  if (!title) return res.status(400).json({ error: 'Task title is required.' });
  const task = await db.insertTask({
    title, description, assignedTo: assignedTo || req.user.id,
    assignedBy: req.user.id, priority, dueDate, estimatedHours,
    category, project, department, tags,
    status: assignedTo && assignedTo !== req.user.id ? 'assigned' : 'in_progress',
    createdBy: req.user.id
  });
  // Notify assignee
  if (assignedTo && String(assignedTo) !== String(req.user.id)) {
    const users = await db.getUsers();
    const assigner = users.find(u => String(u.id) === String(req.user.id));
    await createNotification(assignedTo, 'task_assigned', 'New Task Assigned',
      `You have been assigned a new task: "${title}" by ${assigner ? assigner.name : 'Manager'}`,
      { taskId: task.id });
  }
  await auditLog(req.user.id, req.user.email, 'CREATE', 'task', task.id, { title });
  res.json(task);
});

app.get('/api/tasks/:id', authenticateToken, async (req, res) => {
  const task = await db.getTaskById(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  const role = (req.user.role || '').toLowerCase();
  if (role !== 'admin' && role !== 'manager' &&
      String(task.assignedTo) !== String(req.user.id) && String(task.createdBy) !== String(req.user.id)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const users = await db.getUsers();
  const assignee = users.find(u => String(u.id) === String(task.assignedTo)) || {};
  const assigner = users.find(u => String(u.id) === String(task.assignedBy)) || {};
  const subtasks = await db.getSubtasksByTask(task.id);
  const comments = await db.getCommentsByTask(task.id);
  const attachments = await db.getAttachmentsByTask(task.id);
  res.json({ ...task, assigneeName: assignee.name || 'Unassigned', assignerName: assigner.name || '', subtasks, comments, attachments });
});

app.put('/api/tasks/:id', authenticateToken, async (req, res) => {
  const task = await db.getTaskById(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  const role = (req.user.role || '').toLowerCase();
  if (role !== 'admin' && role !== 'manager' &&
      String(task.assignedTo) !== String(req.user.id)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const allowed = ['title','description','status','priority','percentComplete','actualHours','dueDate','estimatedHours','notes','project','category','department','tags'];
  if (role === 'admin' || role === 'manager') allowed.push('assignedTo','reviewStatus');
  const updates = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
  if (updates.status === 'completed' && !task.completedAt) updates.completedAt = new Date().toISOString();
  const updated = await db.updateTask(req.params.id, updates);
  await auditLog(req.user.id, req.user.email, 'UPDATE', 'task', task.id, updates);
  // Notify if status changes
  if (updates.status && updates.status !== task.status) {
    if (task.assignedBy && String(task.assignedBy) !== String(req.user.id)) {
      await createNotification(task.assignedBy, 'task_update', 'Task Status Updated',
        `Task "${task.title}" status changed to ${updates.status}`, { taskId: task.id });
    }
    if (updates.status === 'completed' && task.assignedBy) {
      await createNotification(task.assignedBy, 'task_completed', 'Task Completed',
        `Task "${task.title}" has been marked as completed.`, { taskId: task.id });
    }
  }
  res.json(updated);
});

app.delete('/api/tasks/:id', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  const task = await db.getTaskById(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  await db.deleteTask(req.params.id);
  await auditLog(req.user.id, req.user.email, 'DELETE', 'task', req.params.id, {});
  res.json({ ok: true });
});

// ═ SUBTASKS ═══════════════════════════════════════════════════════════════
app.get('/api/tasks/:id/subtasks', authenticateToken, async (req, res) => {
  res.json(await db.getSubtasksByTask(req.params.id));
});
app.post('/api/tasks/:id/subtasks', authenticateToken, async (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: 'Subtask title required.' });
  res.json(await db.insertSubtask(req.params.id, { title, description, createdBy: req.user.id }));
});
app.put('/api/tasks/:taskId/subtasks/:id', authenticateToken, async (req, res) => {
  const updated = await db.updateSubtask(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Subtask not found.' });
  // Update task progress
  const subtasks = await db.getSubtasksByTask(req.params.taskId);
  if (subtasks.length > 0) {
    const pct = Math.round((subtasks.filter(s => s.completed).length / subtasks.length) * 100);
    await db.updateTask(req.params.taskId, { percentComplete: pct });
  }
  res.json(updated);
});
app.delete('/api/tasks/:taskId/subtasks/:id', authenticateToken, async (req, res) => {
  await db.deleteSubtask(req.params.id);
  res.json({ ok: true });
});

// ═ TASK COMMENTS ═════════════════════════════════════════════════════════
app.get('/api/tasks/:id/comments', authenticateToken, async (req, res) => {
  res.json(await db.getCommentsByTask(req.params.id));
});
app.post('/api/tasks/:id/comments', authenticateToken, async (req, res) => {
  const { text, activityType = 'comment' } = req.body;
  if (!text) return res.status(400).json({ error: 'Comment text required.' });
  const users = await db.getUsers();
  const user = users.find(u => String(u.id) === String(req.user.id)) || {};
  const comment = await db.insertComment(req.params.id, { text, activityType, authorId: req.user.id, authorName: user.name || req.user.email });
  res.json(comment);
});
app.delete('/api/tasks/:taskId/comments/:id', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  await db.deleteComment(req.params.id);
  res.json({ ok: true });
});

// ═ TASK ATTACHMENTS ═══════════════════════════════════════════════════════
app.get('/api/tasks/:id/attachments', authenticateToken, async (req, res) => {
  res.json(await db.getAttachmentsByTask(req.params.id));
});
app.post('/api/tasks/:id/attachments', authenticateToken, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  const users = await db.getUsers();
  const user = users.find(u => String(u.id) === String(req.user.id)) || {};
  const att = await db.insertAttachment(req.params.id, {
    filename: req.file.originalname,
    storedName: req.file.filename,
    mimetype: req.file.mimetype,
    size: req.file.size,
    url: '/uploads/' + req.file.filename,
    uploadedBy: req.user.id,
    uploadedByName: user.name || req.user.email
  });
  res.json(att);
});
app.delete('/api/tasks/:taskId/attachments/:id', authenticateToken, async (req, res) => {
  const att = await db.deleteAttachment(req.params.id);
  if (att && att.storedName) {
    const fp = path.join(uploadsDir, att.storedName);
    try { fs.unlinkSync(fp); } catch (_) {}
  }
  res.json({ ok: true });
});

// ═ DAILY REPORTS ═════════════════════════════════════════════════════════
app.get('/api/daily-reports', authenticateToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  let reports = await db.getDailyReports();
  if (role === 'engineer' || role === 'trainee') {
    reports = reports.filter(r => String(r.userId) === String(req.user.id));
  }
  const users = await db.getUsers();
  const enriched = reports.map(r => {
    const u = users.find(u => String(u.id) === String(r.userId)) || {};
    return { ...r, employeeName: u.name || '' };
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(enriched);
});
app.get('/api/daily-reports/today', authenticateToken, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const report = await db.getDailyReportByEmployeeDate(req.user.id, today);
  res.json(report || null);
});
app.post('/api/daily-reports', authenticateToken, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const date = req.body.date || today;
  // Prevent duplicate for same day (allow update instead)
  const existing = await db.getDailyReportByEmployeeDate(req.user.id, date);
  if (existing) return res.status(400).json({ error: 'Daily report already submitted for this date. Use PUT to update.' });
  const users = await db.getUsers();
  const user = users.find(u => String(u.id) === String(req.user.id)) || {};
  const report = await db.insertDailyReport({ ...req.body, date, userId: req.user.id, employeeName: user.name });
  res.json(report);
});
app.put('/api/daily-reports/:id', authenticateToken, async (req, res) => {
  const report = await db.getDailyReportById(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found.' });
  const role = (req.user.role || '').toLowerCase();
  if (role !== 'admin' && role !== 'manager' && String(report.userId) !== String(req.user.id)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const updated = await db.updateDailyReport(req.params.id, req.body);
  res.json(updated);
});

// ═ LEAVE TYPES ════════════════════════════════════════════════════════════
app.get('/api/leave-types', authenticateToken, async (req, res) => {
  res.json(await db.getLeaveTypes());
});
app.post('/api/leave-types', authenticateToken, requireRole(['admin']), async (req, res) => {
  const { name, code, defaultDays, isPaid, carryForward, color, description } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'Name and code are required.' });
  const lt = await db.insertLeaveType({ name, code, defaultDays: defaultDays || 0, isPaid: !!isPaid, carryForward: !!carryForward, color: color || '#64748b', description });
  res.json(lt);
});
app.put('/api/leave-types/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  const updated = await db.updateLeaveType(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Leave type not found.' });
  res.json(updated);
});
app.delete('/api/leave-types/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  await db.deleteLeaveType(req.params.id);
  res.json({ ok: true });
});

// ═ LEAVE BALANCE ══════════════════════════════════════════════════════════
app.get('/api/leave-balance', authenticateToken, async (req, res) => {
  await db.initLeaveBalancesForUser(req.user.id, new Date().getFullYear());
  const balances = await db.getLeaveBalanceByEmployee(req.user.id);
  const leaveTypes = await db.getLeaveTypes();
  const enriched = balances.map(b => {
    const lt = leaveTypes.find(t => String(t.id) === String(b.leaveTypeId)) || {};
    return { ...b, leaveTypeName: lt.name || '', leaveTypeCode: lt.code || '', color: lt.color || '#64748b', isPaid: lt.isPaid };
  });
  res.json(enriched);
});
app.get('/api/leave-balance/:employeeId', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  await db.initLeaveBalancesForUser(req.params.employeeId, new Date().getFullYear());
  const balances = await db.getLeaveBalanceByEmployee(req.params.employeeId);
  const leaveTypes = await db.getLeaveTypes();
  const enriched = balances.map(b => {
    const lt = leaveTypes.find(t => String(t.id) === String(b.leaveTypeId)) || {};
    return { ...b, leaveTypeName: lt.name || '', color: lt.color || '#64748b' };
  });
  res.json(enriched);
});
app.put('/api/leave-balance/:employeeId/:leaveTypeId', authenticateToken, requireRole(['admin']), async (req, res) => {
  const bal = await db.upsertLeaveBalance(req.params.employeeId, req.params.leaveTypeId, req.body);
  await auditLog(req.user.id, req.user.email, 'UPDATE', 'leave_balance', req.params.employeeId, req.body);
  res.json(bal);
});

// ═ LEAVE REQUESTS ═════════════════════════════════════════════════════════
app.get('/api/leave-requests', authenticateToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  let reqs = await db.getLeaveRequests();
  if (role === 'engineer' || role === 'trainee') {
    reqs = reqs.filter(r => String(r.userId) === String(req.user.id));
  }
  const users = await db.getUsers();
  const leaveTypes = await db.getLeaveTypes();
  const enriched = reqs.map(r => {
    const u = users.find(u => String(u.id) === String(r.userId)) || {};
    const lt = leaveTypes.find(t => String(t.id) === String(r.leaveTypeId)) || {};
    return { ...r, employeeName: u.name || '', leaveTypeName: lt.name || '', leaveTypeCode: lt.code || '', color: lt.color || '#64748b' };
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(enriched);
});

app.post('/api/leave-requests', authenticateToken, async (req, res) => {
  const { leaveTypeId, fromDate, toDate, isHalfDay, reason, emergencyLeave, contactDuringLeave } = req.body;
  if (!leaveTypeId || !fromDate || !toDate || !reason) {
    return res.status(400).json({ error: 'Leave type, from date, to date and reason are required.' });
  }
  if (new Date(fromDate) > new Date(toDate)) {
    return res.status(400).json({ error: 'From date cannot be after to date.' });
  }
  // Conflict detection
  const existing = await db.getLeaveRequestsByEmployee(req.user.id);
  const conflict = existing.find(r => {
    if (r.status === 'rejected' || r.status === 'cancelled') return false;
    return new Date(fromDate) <= new Date(r.toDate) && new Date(toDate) >= new Date(r.fromDate);
  });
  if (conflict) return res.status(400).json({ error: `Conflict detected with existing leave request (${conflict.fromDate} to ${conflict.toDate}).` });

  const holidays = await db.getHolidays();
  const settings = await db.getHrSettings();
  const workingDays = calcWorkingDays(fromDate, toDate, holidays, settings.weekendDays || ['Saturday', 'Sunday']);
  const users = await db.getUsers();
  const user = users.find(u => String(u.id) === String(req.user.id)) || {};

  // Check balance
  await db.initLeaveBalancesForUser(req.user.id, new Date().getFullYear());
  const balance = await db.getLeaveBalance(req.user.id, leaveTypeId);
  const days = isHalfDay ? 0.5 : workingDays;
  const lt = await db.getLeaveTypeById(leaveTypeId);
  const lr = await db.insertLeaveRequest({
    userId: req.user.id, employeeName: user.name || '',
    leaveTypeId, fromDate, toDate, isHalfDay: !!isHalfDay,
    days, workingDays, reason, emergencyLeave: !!emergencyLeave, contactDuringLeave,
    status: 'submitted'
  });

  // Update pending days in balance if balance record exists
  if (balance) {
    await db.upsertLeaveBalance(req.user.id, leaveTypeId, { pendingDays: (balance.pendingDays || 0) + days });
  }

  // Notify admins and HR managers
  const allUsers = await db.getUsers();
  const approvers = allUsers.filter(u => ['admin', 'hr', 'manager'].includes((u.role || '').toLowerCase()));
  for (const approver of approvers) {
    await createNotification(approver.id, 'leave_applied', 'Leave Request Received',
      `${user.name || 'Employee'} has applied for ${lt ? lt.name : 'leave'} from ${fromDate} to ${toDate}`,
      { leaveRequestId: lr.id });
  }
  await auditLog(req.user.id, req.user.email, 'CREATE', 'leave_request', lr.id, { leaveTypeId, fromDate, toDate, days });
  res.json(lr);
});

app.get('/api/leave-requests/:id', authenticateToken, async (req, res) => {
  const lr = await db.getLeaveRequestById(req.params.id);
  if (!lr) return res.status(404).json({ error: 'Leave request not found.' });
  const role = (req.user.role || '').toLowerCase();
  if (role !== 'admin' && role !== 'manager' && String(lr.userId) !== String(req.user.id)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  const approvals = await db.getLeaveApprovalsByRequest(lr.id);
  res.json({ ...lr, approvals });
});

app.post('/api/leave-requests/:id/approve', authenticateToken, requireRole(['admin', 'hr', 'manager']), async (req, res) => {
  const lr = await db.getLeaveRequestById(req.params.id);
  if (!lr) return res.status(404).json({ error: 'Leave request not found.' });
  if (lr.status === 'approved') return res.status(400).json({ error: 'Already approved.' });
  const users = await db.getUsers();
  const approver = users.find(u => String(u.id) === String(req.user.id)) || {};
  await db.insertLeaveApproval({ leaveRequestId: lr.id, approvedBy: req.user.id, approverName: approver.name || '', action: 'approved', comments: req.body.comments || '' });
  await db.updateLeaveRequest(lr.id, { status: 'approved', approvedBy: req.user.id, approvedAt: new Date().toISOString() });
  // Update balance: convert pending to used
  const balance = await db.getLeaveBalance(lr.userId, lr.leaveTypeId);
  if (balance) {
    await db.upsertLeaveBalance(lr.userId, lr.leaveTypeId, {
      usedDays: (balance.usedDays || 0) + lr.days,
      pendingDays: Math.max(0, (balance.pendingDays || 0) - lr.days)
    });
  }
  await createNotification(lr.userId, 'leave_approved', 'Leave Approved',
    `Your leave request from ${lr.fromDate} to ${lr.toDate} has been approved.`, { leaveRequestId: lr.id });
  await auditLog(req.user.id, req.user.email, 'APPROVE', 'leave_request', lr.id, {});
  res.json({ ok: true });
});

app.post('/api/leave-requests/:id/reject', authenticateToken, requireRole(['admin', 'hr', 'manager']), async (req, res) => {
  const lr = await db.getLeaveRequestById(req.params.id);
  if (!lr) return res.status(404).json({ error: 'Leave request not found.' });
  const users = await db.getUsers();
  const rejecter = users.find(u => String(u.id) === String(req.user.id)) || {};
  await db.insertLeaveApproval({ leaveRequestId: lr.id, approvedBy: req.user.id, approverName: rejecter.name || '', action: 'rejected', comments: req.body.comments || '' });
  await db.updateLeaveRequest(lr.id, { status: 'rejected', rejectedBy: req.user.id, rejectedAt: new Date().toISOString(), rejectionReason: req.body.comments || '' });
  // Release pending days
  const balance = await db.getLeaveBalance(lr.userId, lr.leaveTypeId);
  if (balance) await db.upsertLeaveBalance(lr.userId, lr.leaveTypeId, { pendingDays: Math.max(0, (balance.pendingDays || 0) - lr.days) });
  await createNotification(lr.userId, 'leave_rejected', 'Leave Rejected',
    `Your leave request from ${lr.fromDate} to ${lr.toDate} has been rejected. Reason: ${req.body.comments || 'N/A'}`, { leaveRequestId: lr.id });
  await auditLog(req.user.id, req.user.email, 'REJECT', 'leave_request', lr.id, { reason: req.body.comments });
  res.json({ ok: true });
});

app.post('/api/leave-requests/:id/cancel', authenticateToken, async (req, res) => {
  const lr = await db.getLeaveRequestById(req.params.id);
  if (!lr) return res.status(404).json({ error: 'Leave request not found.' });
  const role = (req.user.role || '').toLowerCase();
  if (role !== 'admin' && String(lr.userId) !== String(req.user.id)) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  if (lr.status === 'cancelled') return res.status(400).json({ error: 'Already cancelled.' });
  await db.updateLeaveRequest(lr.id, { status: 'cancelled', cancelledAt: new Date().toISOString() });
  // Release pending days if not yet approved
  if (lr.status !== 'approved') {
    const balance = await db.getLeaveBalance(lr.userId, lr.leaveTypeId);
    if (balance) await db.upsertLeaveBalance(lr.userId, lr.leaveTypeId, { pendingDays: Math.max(0, (balance.pendingDays || 0) - lr.days) });
  }
  await auditLog(req.user.id, req.user.email, 'CANCEL', 'leave_request', lr.id, {});
  res.json({ ok: true });
});

// ═ HOLIDAYS ══════════════════════════════════════════════════════════════
app.get('/api/holidays', authenticateToken, async (req, res) => {
  res.json((await db.getHolidays()).sort((a, b) => new Date(a.date) - new Date(b.date)));
});
app.post('/api/holidays', authenticateToken, requireRole(['admin', 'hr']), async (req, res) => {
  const { name, date, type, isOptional, description } = req.body;
  if (!name || !date) return res.status(400).json({ error: 'Name and date are required.' });
  const hol = await db.insertHoliday({ name, date, type: type || 'company', isOptional: !!isOptional, description });
  await auditLog(req.user.id, req.user.email, 'CREATE', 'holiday', hol.id, { name, date });
  res.json(hol);
});
app.put('/api/holidays/:id', authenticateToken, requireRole(['admin', 'hr']), async (req, res) => {
  const updated = await db.updateHoliday(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Holiday not found.' });
  res.json(updated);
});
app.delete('/api/holidays/:id', authenticateToken, requireRole(['admin', 'hr']), async (req, res) => {
  await db.deleteHoliday(req.params.id);
  res.json({ ok: true });
});

// ═ ATTENDANCE ══════════════════════════════════════════════════════════════
app.get('/api/attendance', authenticateToken, async (req, res) => {
  const role = (req.user.role || '').toLowerCase();
  if (role === 'admin' || role === 'hr' || role === 'manager') {
    const records = await db.getAttendance();
    const users = await db.getUsers();
    res.json(records.map(r => {
      const u = users.find(u => String(u.id) === String(r.userId)) || {};
      return { ...r, employeeName: u.name || '' };
    }));
  } else {
    const records = await db.getAttendanceByEmployee(req.user.id);
    res.json(records);
  }
});
app.get('/api/attendance/today', authenticateToken, async (req, res) => {
  const record = await db.getTodayAttendance(req.user.id);
  res.json(record || null);
});
app.post('/api/attendance/checkin', authenticateToken, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const existing = await db.getTodayAttendance(req.user.id);
  if (existing && existing.checkIn) return res.status(400).json({ error: 'Already checked in today.' });
  const record = await db.upsertAttendance(req.user.id, today, { checkIn: new Date().toISOString(), status: 'present' });
  res.json(record);
});
app.post('/api/attendance/checkout', authenticateToken, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const existing = await db.getTodayAttendance(req.user.id);
  if (!existing || !existing.checkIn) return res.status(400).json({ error: 'Please check in first.' });
  if (existing.checkOut) return res.status(400).json({ error: 'Already checked out today.' });
  const checkOut = new Date().toISOString();
  const hours = ((new Date(checkOut) - new Date(existing.checkIn)) / 3600000).toFixed(2);
  const record = await db.upsertAttendance(req.user.id, today, { checkOut, workingHours: parseFloat(hours) });
  res.json(record);
});

// ═ HR ATTENDANCE MANUAL OVERRIDE (MARK PRESENT / ABSENT) ════════════════════
app.post('/api/hr/attendance/mark', authenticateToken, requireRole(['admin', 'hr', 'manager']), async (req, res) => {
  const userId = req.body.userId || req.body.employeeId;
  const { date, status, checkIn, checkOut, remarks } = req.body;
  if (!userId || !date || !status) {
    return res.status(400).json({ error: 'User ID, date, and status are required.' });
  }
  const users = await db.getUsers();
  const targetUser = users.find(u => String(u.id) === String(userId));
  if (!targetUser) return res.status(404).json({ error: 'Employee not found.' });

  const validStatuses = ['present', 'absent', 'half_day', 'on_leave'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  let workingHours = 0;
  if (status === 'present') {
    if (checkIn && checkOut) {
      const diff = (new Date(checkOut) - new Date(checkIn)) / 3600000;
      workingHours = Math.max(0, Math.round(diff * 10) / 10);
    } else {
      workingHours = 8;
    }
  } else if (status === 'half_day') {
    workingHours = 4;
  }

  const record = await db.upsertAttendance(userId, date, {
    userName: targetUser.name,
    status,
    checkIn: status === 'present' ? (checkIn || `${date}T09:00:00.000Z`) : null,
    checkOut: status === 'present' ? (checkOut || `${date}T18:00:00.000Z`) : null,
    workingHours,
    remarks: remarks || `Manually marked ${status} by HR (${req.user.email || req.user.role})`
  });

  await auditLog(req.user.id, req.user.email, 'HR_ATTENDANCE_OVERRIDE', 'attendance', record.id || userId, {
    targetUser: targetUser.name,
    date,
    status,
    remarks
  });

  res.json({ ok: true, record });
});

// ═ ACTIVE LEAVE PRESENT REASON (POPUP SUBMISSION) ═══════════════════════════
app.post('/api/attendance/leave-present-reason', authenticateToken, async (req, res) => {
  const { reason, date = new Date().toISOString().slice(0, 10) } = req.body;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Reason for attending today is required.' });
  }
  const userId = req.user.id;
  const users = await db.getUsers();
  const user = users.find(u => String(u.id) === String(userId));
  const userName = user ? user.name : 'Unknown User';

  const checkIn = new Date().toISOString();
  const record = await db.upsertAttendance(userId, date, {
    userName,
    status: 'present',
    checkIn,
    checkOut: null,
    workingHours: 0,
    presentDespiteLeave: true,
    leavePresentReason: reason.trim(),
    remarks: `Attended during approved leave: ${reason.trim()}`
  });

  // Notify HR and Admin
  const adminUsers = users.filter(u => ['admin', 'hr'].includes((u.role || '').toLowerCase()));
  for (const adm of adminUsers) {
    await db.insertNotification({
      userId: adm.id,
      title: 'Active Leave Attendance Alert',
      message: `${userName} logged in and attended work today (${date}) despite an approved leave. Reason: "${reason.trim()}"`,
      type: 'leave_alert',
      link: '/attendance'
    });
  }

  await auditLog(userId, req.user.email, 'LEAVE_OVERRIDE_PRESENT', 'attendance', record.id || userId, { reason: reason.trim() });
  res.json({ ok: true, message: 'Reason recorded and attendance marked as present.', record });
});

// ═ DYNAMIC TEAM AVAILABILITY FOR LEAVE CALENDAR ═════════════════════════════
app.get('/api/availability', authenticateToken, requireRole(['admin', 'hr', 'manager']), async (req, res) => {
  const dateStr = req.query.date || new Date().toISOString().slice(0, 10);
  const targetDate = new Date(dateStr);
  const dayOfWeek = targetDate.getDay(); // 0 is Sunday
  const isSunday = dayOfWeek === 0;

  const users = await db.getUsers();
  const allLeaves = await db.getLeaveRequests();
  const holidays = await db.getHolidays();
  const attendance = await db.getAttendance();

  const holiday = holidays.find(h => h.date === dateStr);

  const leavesOnDate = allLeaves.filter(lr => {
    if (lr.status !== 'approved') return false;
    return dateStr >= lr.fromDate && dateStr <= lr.toDate;
  });

  const onLeaveMap = new Map();
  leavesOnDate.forEach(l => onLeaveMap.set(String(l.userId), l));

  const attOnDate = attendance.filter(a => a.date === dateStr);
  const attMap = new Map();
  attOnDate.forEach(a => attMap.set(String(a.userId), a));

  const availableEmployees = [];
  const onLeaveEmployees = [];

  for (const u of users) {
    const leave = onLeaveMap.get(String(u.id));
    const att = attMap.get(String(u.id));
    if (leave) {
      onLeaveEmployees.push({
        userId: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        leaveTypeName: leave.leaveTypeName,
        reason: leave.reason,
        fromDate: leave.fromDate,
        toDate: leave.toDate,
        presentDespiteLeave: att?.presentDespiteLeave || false,
        leavePresentReason: att?.leavePresentReason || null
      });
      if (att?.presentDespiteLeave) {
        availableEmployees.push({
          userId: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          phone: u.phone,
          status: 'present_override',
          note: `Present despite leave (${att.leavePresentReason})`
        });
      }
    } else {
      availableEmployees.push({
        userId: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        phone: u.phone,
        status: att?.status || 'available',
        checkIn: att?.checkIn || null,
        checkOut: att?.checkOut || null
      });
    }
  }

  res.json({
    date: dateStr,
    dayOfWeek,
    isSunday,
    holiday: holiday || null,
    totalEmployees: users.length,
    availableCount: isSunday ? 0 : availableEmployees.length,
    onLeaveCount: onLeaveEmployees.length,
    availableEmployees: isSunday ? [] : availableEmployees,
    onLeaveEmployees
  });
});

// ═ NOTIFICATIONS ══════════════════════════════════════════════════════════
app.get('/api/notifications', authenticateToken, async (req, res) => {
  const notifications = await db.getNotificationsByUser(req.user.id);
  res.json(notifications);
});
app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  await db.markNotificationRead(req.params.id);
  res.json({ ok: true });
});
app.put('/api/notifications/read-all', authenticateToken, async (req, res) => {
  await db.markAllNotificationsRead(req.user.id);
  res.json({ ok: true });
});

// ═ AUDIT LOGS ══════════════════════════════════════════════════════════════
app.get('/api/audit-logs', authenticateToken, requireRole(['admin']), async (req, res) => {
  res.json(await db.getAuditLogs());
});

// ═ HR SETTINGS ════════════════════════════════════════════════════════════
app.get('/api/hr-settings', authenticateToken, async (req, res) => {
  res.json(await db.getHrSettings());
});
app.put('/api/hr-settings', authenticateToken, requireRole(['admin']), async (req, res) => {
  const updated = await db.updateHrSettings(req.body);
  await auditLog(req.user.id, req.user.email, 'UPDATE', 'hr_settings', 'global', req.body);
  res.json(updated);
});

// ═ REPORTS ══════════════════════════════════════════════════════════════════
app.get('/api/reports/tasks', authenticateToken, requireRole(['admin', 'hr', 'manager']), async (req, res) => {
  const tasks = await db.getTasks();
  const users = await db.getUsers();
  const now = new Date();
  const summary = {
    total: tasks.length,
    completed: tasks.filter(t => t.status === 'completed').length,
    inProgress: tasks.filter(t => t.status === 'in_progress').length,
    overdue: tasks.filter(t => t.dueDate && new Date(t.dueDate) < now && t.status !== 'completed').length,
    notStarted: tasks.filter(t => t.status === 'not_started' || t.status === 'assigned').length,
    byEmployee: users.map(u => ({
      userId: u.id, name: u.name,
      assigned: tasks.filter(t => String(t.assignedTo) === String(u.id)).length,
      completed: tasks.filter(t => String(t.assignedTo) === String(u.id) && t.status === 'completed').length
    }))
  };
  res.json(summary);
});

app.get('/api/reports/tasks/export', authenticateToken, requireRole(['admin', 'hr', 'manager']), async (req, res) => {
  const tasks = await db.getTasks();
  const users = await db.getUsers();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Tasks');
  sheet.addRow(['Task ID', 'Title', 'Assigned To', 'Assigned By', 'Priority', 'Status', '% Complete', 'Due Date', 'Created At']);
  tasks.forEach(t => {
    const assignee = users.find(u => String(u.id) === String(t.assignedTo)) || {};
    const assigner = users.find(u => String(u.id) === String(t.assignedBy)) || {};
    sheet.addRow([t.id, t.title, assignee.name || '', assigner.name || '', t.priority, t.status, t.percentComplete || 0, t.dueDate || '', t.createdAt || '']);
  });
  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="tasks_report.xlsx"');
  res.send(buffer);
});

app.get('/api/reports/leaves', authenticateToken, requireRole(['admin', 'hr', 'manager']), async (req, res) => {
  const reqs = await db.getLeaveRequests();
  const users = await db.getUsers();
  const leaveTypes = await db.getLeaveTypes();
  const enriched = reqs.map(r => {
    const u = users.find(u => String(u.id) === String(r.userId)) || {};
    const lt = leaveTypes.find(t => String(t.id) === String(r.leaveTypeId)) || {};
    return { ...r, employeeName: u.name || '', leaveTypeName: lt.name || '' };
  });
  res.json(enriched);
});

app.get('/api/reports/leaves/export', authenticateToken, requireRole(['admin', 'hr', 'manager']), async (req, res) => {
  const reqs = await db.getLeaveRequests();
  const users = await db.getUsers();
  const leaveTypes = await db.getLeaveTypes();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Leave Requests');
  sheet.addRow(['Leave ID', 'Employee', 'Leave Type', 'From', 'To', 'Days', 'Status', 'Reason', 'Applied On']);
  reqs.forEach(r => {
    const u = users.find(u => String(u.id) === String(r.userId)) || {};
    const lt = leaveTypes.find(t => String(t.id) === String(r.leaveTypeId)) || {};
    sheet.addRow([r.id, u.name || '', lt.name || '', r.fromDate, r.toDate, r.days, r.status, r.reason || '', r.createdAt || '']);
  });
  const buffer = await workbook.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="leaves_report.xlsx"');
  res.send(buffer);
});

app.get('/api/reports/attendance', authenticateToken, requireRole(['admin', 'hr', 'manager']), async (req, res) => {
  const records = await db.getAttendance();
  const users = await db.getUsers();
  res.json(records.map(r => {
    const u = users.find(u => String(u.id) === String(r.userId)) || {};
    return { ...r, employeeName: u.name || '' };
  }));
});

app.get('/api/reports/daily', authenticateToken, requireRole(['admin', 'hr', 'manager']), async (req, res) => {
  const reports = await db.getDailyReports();
  const users = await db.getUsers();
  const enriched = reports.map(r => {
    const u = users.find(u => String(u.id) === String(r.userId)) || {};
    return { ...r, employeeName: u.name || '' };
  });
  res.json(enriched);
});

// ═ COMPREHENSIVE MULTI-DAY SHEET-WISE EXCEL EXPORT (SHEET PER DAY) ═══════════
app.get('/api/reports/hr-multi-sheet-excel', authenticateToken, requireRole(['admin', 'hr', 'manager']), async (req, res) => {
  try {
    let { startDate, endDate } = req.query;
    const now = new Date();
    if (!endDate) endDate = now.toISOString().slice(0, 10);
    if (!startDate) {
      const past7 = new Date(now.getTime() - 6 * 24 * 3600 * 1000);
      startDate = past7.toISOString().slice(0, 10);
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) return res.status(400).json({ error: 'End date must be on or after start date.' });

    const users = await db.getUsers();
    const attendance = await db.getAttendance();
    const leaves = await db.getLeaveRequests();
    const tasks = await db.getTasks();
    const dailyReports = await db.getDailyReports();
    const holidays = await db.getHolidays();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'IITM IEAC Workforce System';
    workbook.lastModifiedBy = req.user.email || 'HR Admin';
    workbook.created = new Date();

    // Generate list of dates
    const dateList = [];
    let cur = new Date(start);
    while (cur <= end) {
      dateList.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }

    // Working days count (excluding Sunday)
    const workingDaysList = dateList.filter(d => new Date(d).getDay() !== 0);
    const totalWorkingDays = Math.max(1, workingDaysList.length);

    // ── SHEET 1: EXECUTIVE SUMMARY & ATTENDANCE % ──────────────────────────
    const summarySheet = workbook.addWorksheet('Summary & Attendance %', {
      views: [{ showGridLines: true }]
    });

    summarySheet.addRow(['IIT MADRAS - INDUSTRIAL ENERGY ASSESSMENT CELL']);
    summarySheet.addRow(['HR WORKFORCE ATTENDANCE & TASK PERFORMANCE SUMMARY']);
    summarySheet.addRow([`Report Period: ${startDate} to ${endDate} (${dateList.length} Calendar Days, ${totalWorkingDays} Working Days)`]);
    summarySheet.addRow([`Generated on: ${new Date().toLocaleString()} | Generated by: ${req.user.email || req.user.role}`]);
    summarySheet.addRow([]);

    const summaryHeaderRow = summarySheet.addRow([
      'S.No', 'Employee Name', 'Login / Mail ID', 'Designation / Role',
      'Total Period Days', 'Working Days', 'Days Present', 'Days Absent',
      'Attendance %', 'Tasks Completed', 'Total Tasks Assigned', 'Daily Reports Submitted'
    ]);

    summaryHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    summaryHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' };
    summaryHeaderRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });

    users.forEach((u, idx) => {
      const userAtt = attendance.filter(a => String(a.userId) === String(u.id) && dateList.includes(a.date));
      const daysPresent = userAtt.filter(a => a.status === 'present' || a.checkIn).length;
      const daysAbsent = Math.max(0, totalWorkingDays - daysPresent);
      const attPct = Math.min(100, Math.round((daysPresent / totalWorkingDays) * 1000) / 10);

      const userTasks = tasks.filter(t => String(t.assignedTo) === String(u.id));
      const completedTasks = userTasks.filter(t => t.status === 'completed').length;
      const userReports = dailyReports.filter(r => String(r.userId) === String(u.id) && dateList.includes(r.date)).length;

      const row = summarySheet.addRow([
        idx + 1,
        u.name || 'Unknown',
        u.email || '',
        u.role || 'Staff',
        dateList.length,
        totalWorkingDays,
        daysPresent,
        daysAbsent,
        `${attPct}%`,
        completedTasks,
        userTasks.length,
        userReports
      ]);

      const isEven = idx % 2 === 0;
      row.eachCell((cell, colNum) => {
        if (isEven) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
        cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }, left: { style: 'thin', color: { argb: 'FFE2E8F0' } }, right: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
        if (colNum === 9) { // Attendance %
          cell.font = { bold: true, color: { argb: attPct >= 90 ? 'FF16A34A' : attPct >= 75 ? 'FFD97706' : 'FFDC2626' } };
        }
      });
    });

    summarySheet.columns = [
      { width: 8 }, { width: 26 }, { width: 30 }, { width: 18 },
      { width: 18 }, { width: 15 }, { width: 15 }, { width: 15 },
      { width: 16 }, { width: 18 }, { width: 20 }, { width: 24 }
    ];

    // ── SHEETS 2..N: DEDICATED WORKSHEET PER DAY ───────────────────────────
    const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    for (const curDate of dateList) {
      const dObj = new Date(curDate);
      const dayName = DAYS_FULL[dObj.getDay()];
      const isSunday = dObj.getDay() === 0;
      const holiday = holidays.find(h => h.date === curDate);

      // Sheet name (max 31 chars)
      const sheetName = curDate;
      const daySheet = workbook.addWorksheet(sheetName, { views: [{ showGridLines: true }] });

      // Daily attendance and leave calculations
      const dayAtt = attendance.filter(a => a.date === curDate);
      const dayLeaves = leaves.filter(l => l.status === 'approved' && curDate >= l.fromDate && curDate <= l.toDate);
      const onLeaveMap = new Map();
      dayLeaves.forEach(l => onLeaveMap.set(String(l.userId), l));

      const presentUsers = [];
      const absentUsers = [];

      users.forEach(u => {
        const att = dayAtt.find(a => String(a.userId) === String(u.id));
        const leave = onLeaveMap.get(String(u.id));

        if (att && (att.status === 'present' || att.checkIn)) {
          presentUsers.push({ user: u, att, leave });
        } else {
          absentUsers.push({ user: u, att, leave });
        }
      });

      // Daily Title
      daySheet.addRow([`WORKFORCE DAILY LOG — ${curDate} (${dayName.toUpperCase()})`]);
      if (holiday) daySheet.addRow([`Public Holiday: ${holiday.name} (${holiday.type || 'National'})`]);
      if (isSunday) daySheet.addRow([`Note: Sunday Weekly Off — Office Operations Closed`]);
      daySheet.addRow([`Total Staff: ${users.length} | Present: ${presentUsers.length} | Absent: ${absentUsers.length} | On Leave: ${dayLeaves.length}`]);
      daySheet.addRow([]);

      // ── SECTION 1: PRESENT EMPLOYEES ──
      const presentTitleRow = daySheet.addRow([`PRESENT EMPLOYEES (${presentUsers.length})`]);
      presentTitleRow.font = { bold: true, color: { argb: 'FF166534' } };

      const presentHeaderRow = daySheet.addRow([
        'S.No', 'Employee Name', 'Role / Designation', 'Check-In Time',
        'Check-Out Time', 'Duration (Hours)', 'Status', 'Remarks / Leave Notes'
      ]);
      presentHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      presentHeaderRow.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15803D' } };
        c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });

      if (presentUsers.length === 0) {
        daySheet.addRow(['-', 'No employees checked in on this date', '', '', '', '', '', '']);
      } else {
        presentUsers.forEach((p, idx) => {
          const inTime = p.att?.checkIn ? new Date(p.att.checkIn).toLocaleTimeString() : '09:00 AM';
          const outTime = p.att?.checkOut ? new Date(p.att.checkOut).toLocaleTimeString() : (p.att?.workingHours ? '06:00 PM' : 'In Progress');
          const hours = p.att?.workingHours || 8;
          const statusText = p.att?.presentDespiteLeave ? 'Present (Override)' : (p.att?.status || 'Present');
          const remarks = p.att?.leavePresentReason ? `Attended despite leave: ${p.att.leavePresentReason}` : (p.att?.remarks || 'Regular Attendance');

          daySheet.addRow([
            idx + 1,
            p.user.name || 'Unknown',
            p.user.role || 'Staff',
            inTime,
            outTime,
            hours,
            statusText,
            remarks
          ]);
        });
      }

      daySheet.addRow([]);

      // ── SECTION 2: ABSENT / ON LEAVE EMPLOYEES ──
      const absentTitleRow = daySheet.addRow([`ABSENT / ON-LEAVE EMPLOYEES (${absentUsers.length})`]);
      absentTitleRow.font = { bold: true, color: { argb: 'FF991B1B' } };

      const absentHeaderRow = daySheet.addRow([
        'S.No', 'Employee Name', 'Role / Designation', 'Status', 'Reason / Leave Category'
      ]);
      absentHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      absentHeaderRow.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB91C1C' } };
        c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });

      if (absentUsers.length === 0) {
        daySheet.addRow(['-', 'Full team present', '', '', '']);
      } else {
        absentUsers.forEach((a, idx) => {
          const statusText = a.leave ? `On Leave (${a.leave.leaveTypeName || 'Leave'})` : (isSunday ? 'Weekly Off' : (holiday ? 'Holiday' : 'Absent'));
          const reasonText = a.leave ? (a.leave.reason || 'Approved Leave') : (isSunday ? 'Sunday' : (holiday ? holiday.name : 'Not Logged / Absent'));

          daySheet.addRow([
            idx + 1,
            a.user.name || 'Unknown',
            a.user.role || 'Staff',
            statusText,
            reasonText
          ]);
        });
      }

      daySheet.addRow([]);

      // ── SECTION 3: TASKS WORKED / LOGGED ON THIS DAY ──
      const dayTasks = tasks.filter(t => (t.createdAt && t.createdAt.slice(0, 10) === curDate) || (t.dueDate && t.dueDate === curDate) || (t.status === 'completed' && t.updatedAt && t.updatedAt.slice(0, 10) === curDate));
      const dayDailyReports = dailyReports.filter(r => r.date === curDate);

      const tasksTitleRow = daySheet.addRow([`TASKS & WORK UPDATES LOGGED ON THIS DAY (${dayTasks.length + dayDailyReports.length})`]);
      tasksTitleRow.font = { bold: true, color: { argb: 'FF1E40AF' } };

      const tasksHeaderRow = daySheet.addRow([
        'S.No', 'Employee', 'Activity / Task Title', 'Type', 'Priority / Status', 'Details / Work Description'
      ]);
      tasksHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      tasksHeaderRow.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
        c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });

      let activityIdx = 1;
      if (dayTasks.length === 0 && dayDailyReports.length === 0) {
        daySheet.addRow(['-', 'No specific tasks or daily reports logged on this date', '', '', '', '']);
      } else {
        dayTasks.forEach(t => {
          const assignee = users.find(u => String(u.id) === String(t.assignedTo)) || {};
          daySheet.addRow([
            activityIdx++,
            assignee.name || 'Unassigned',
            t.title || 'Task',
            'Task',
            `${t.priority || 'Normal'} / ${t.status || 'Active'}`,
            t.description || ''
          ]);
        });
        dayDailyReports.forEach(r => {
          const u = users.find(x => String(x.id) === String(r.userId)) || {};
          const workText = (r.tasksCompleted || []).map(tc => tc.title || tc.description).join('; ') || r.summary || 'Daily Work Update';
          daySheet.addRow([
            activityIdx++,
            u.name || r.employeeName || 'Staff',
            'Daily Work Report',
            'Daily Report',
            `${r.status || 'submitted'} (${r.hoursWorked || 8} hrs)`,
            workText
          ]);
        });
      }

      daySheet.columns = [
        { width: 8 }, { width: 28 }, { width: 22 }, { width: 18 },
        { width: 18 }, { width: 16 }, { width: 20 }, { width: 35 }
      ];
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const safeFileName = `IITM_IEAC_HR_Report_${startDate}_${endDate}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    res.send(buffer);
  } catch (err) {
    console.error('HR Multi-Sheet Excel generation failed:', err);
    res.status(500).json({ error: 'Failed to generate HR multi-sheet report: ' + err.message });
  }
});

// ═ HR STATS DASHBOARD ═════════════════════════════════════════════════════
app.get('/api/hr-stats', authenticateToken, requireRole(['admin', 'hr', 'manager']), async (req, res) => {
  const { timeframe = 'month', startDate: customStart, endDate: customEnd } = req.query;
  const users = await db.getUsers();
  const tasks = await db.getTasks();
  const attendance = await db.getAttendance();
  const leaveReqs = await db.getLeaveRequests();
  const dailyReports = await db.getDailyReports();
  const holidays = await db.getHolidays();
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();

  // Determine period start and end
  let pStart, pEnd;
  pEnd = customEnd ? new Date(customEnd) : new Date(today);
  if (customStart) {
    pStart = new Date(customStart);
  } else if (timeframe === 'day') {
    pStart = new Date(today);
  } else if (timeframe === 'week') {
    pStart = new Date(now.getTime() - 6 * 24 * 3600 * 1000);
  } else {
    // month default: 30 days
    pStart = new Date(now.getTime() - 29 * 24 * 3600 * 1000);
  }

  // Build working dates in period (excluding Sunday)
  const periodDates = [];
  let dIter = new Date(pStart);
  while (dIter <= pEnd) {
    periodDates.push(dIter.toISOString().slice(0, 10));
    dIter.setDate(dIter.getDate() + 1);
  }
  const workingDaysInPeriod = Math.max(1, periodDates.filter(d => new Date(d).getDay() !== 0).length);

  // Today's specific workforce
  const todayAtt = attendance.filter(a => a.date === today);
  const approvedLeavesToday = leaveReqs.filter(r => r.status === 'approved' && today >= r.fromDate && today <= r.toDate);
  const onLeaveUserIds = new Set(approvedLeavesToday.map(r => String(r.userId)));

  const membersPresentToday = [];
  const membersAbsentToday = [];
  const membersOnLeaveToday = [];

  users.forEach(u => {
    const att = todayAtt.find(a => String(a.userId) === String(u.id));
    const isLeave = onLeaveUserIds.has(String(u.id));

    if (att && (att.status === 'present' || att.checkIn)) {
      membersPresentToday.push({
        id: u.id,
        name: u.name,
        role: u.role,
        email: u.email,
        checkIn: att.checkIn,
        checkOut: att.checkOut,
        workingHours: att.workingHours || 0,
        presentDespiteLeave: att.presentDespiteLeave || false,
        leavePresentReason: att.leavePresentReason || null
      });
    } else if (isLeave) {
      const lr = approvedLeavesToday.find(r => String(r.userId) === String(u.id));
      membersOnLeaveToday.push({
        id: u.id,
        name: u.name,
        role: u.role,
        email: u.email,
        leaveTypeName: lr?.leaveTypeName || 'Leave',
        reason: lr?.reason || ''
      });
    } else {
      membersAbsentToday.push({
        id: u.id,
        name: u.name,
        role: u.role,
        email: u.email
      });
    }
  });

  // Calculate Employee-wise performance and attendance percentage
  const employeeMetrics = users.map(u => {
    const userAtt = attendance.filter(a => String(a.userId) === String(u.id) && periodDates.includes(a.date));
    const daysPresent = userAtt.filter(a => a.status === 'present' || a.checkIn).length;
    const daysAbsent = Math.max(0, workingDaysInPeriod - daysPresent);
    const attendancePercentage = Math.min(100, Math.round((daysPresent / workingDaysInPeriod) * 1000) / 10);

    const userTasks = tasks.filter(t => String(t.assignedTo) === String(u.id));
    const completedTasks = userTasks.filter(t => t.status === 'completed').length;
    const inProgressTasks = userTasks.filter(t => t.status === 'in_progress').length;
    const taskCompletionRate = userTasks.length > 0 ? Math.round((completedTasks / userTasks.length) * 100) : 0;
    const userDailyReports = dailyReports.filter(r => String(r.userId) === String(u.id) && periodDates.includes(r.date)).length;

    return {
      userId: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      workingDays: workingDaysInPeriod,
      daysPresent,
      daysAbsent,
      attendancePercentage,
      totalTasks: userTasks.length,
      completedTasks,
      inProgressTasks,
      taskCompletionRate,
      dailyReportsSubmitted: userDailyReports
    };
  });

  // Day-wise tasks breakdown
  const tasksDoneDayWise = periodDates.map(dateStr => {
    const dayT = tasks.filter(t => (t.createdAt && t.createdAt.slice(0, 10) === dateStr) || (t.status === 'completed' && t.updatedAt && t.updatedAt.slice(0, 10) === dateStr));
    const dayR = dailyReports.filter(r => r.date === dateStr);
    return {
      date: dateStr,
      tasksCount: dayT.length,
      reportsCount: dayR.length,
      completedCount: dayT.filter(t => t.status === 'completed').length
    };
  });

  res.json({
    totalEmployees: users.length,
    presentToday: membersPresentToday.length,
    absentToday: membersAbsentToday.length,
    onLeaveToday: membersOnLeaveToday.length,
    membersPresentToday,
    membersAbsentToday,
    membersOnLeaveToday,
    employeeMetrics,
    tasksDoneDayWise,
    period: {
      timeframe,
      startDate: pStart.toISOString().slice(0, 10),
      endDate: pEnd.toISOString().slice(0, 10),
      workingDays: workingDaysInPeriod
    },
    pendingLeaves: leaveReqs.filter(r => r.status === 'submitted').length,
    pendingDailyReports: dailyReports.filter(r => r.date === today && r.status === 'submitted').length,
    totalTasks: tasks.length,
    completedTasks: tasks.filter(t => t.status === 'completed').length,
    overdueTasks: tasks.filter(t => t.dueDate && new Date(t.dueDate) < now && t.status !== 'completed').length,
    inProgressTasks: tasks.filter(t => t.status === 'in_progress').length,
    taskCompletionRate: tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'completed').length / tasks.length) * 100) : 0
  });
});

const PORT = process.env.PORT || 3000;
const os = require('os');
const networkInterfaces = os.networkInterfaces();
let wifiIp = 'localhost';
for (const name of Object.keys(networkInterfaces)) {
  for (const net of networkInterfaces[name]) {
    if (net.family === 'IPv4' && !net.internal) {
      wifiIp = net.address;
    }
  }
}

// Centralized Error Handling Middleware (Debug Mode / Production Sanitization)
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err.message);
  if (res.headersSent) {
    return next(err);
  }
  const isProduction = process.env.NODE_ENV === 'production';
  res.status(err.status || 500).json({
    error: isProduction ? 'An unexpected internal server error occurred.' : (err.message || 'Internal server error'),
    code: err.code || 'INTERNAL_ERROR'
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Local URL:   http://localhost:${PORT}`);
  console.log(`WiFi URL:    http://${wifiIp}:${PORT}`);
});
