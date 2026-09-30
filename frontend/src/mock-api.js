// Client-Side Simulated API Layer for Netlify Serverless Deployment backed by Supabase
import ExcelJS from 'exceljs';
import { supabase, adminAuthClient } from './lib/supabase';

// Helper to convert DB snake_case to frontend camelCase
function snakeToCamel(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(snakeToCamel);
  const newObj = {};
  for (const key of Object.keys(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    newObj[camelKey] = snakeToCamel(obj[key]);
  }
  return newObj;
}

// Helper to convert frontend camelCase to DB snake_case
function camelToSnake(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(camelToSnake);
  const newObj = {};
  for (const key of Object.keys(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    newObj[snakeKey] = camelToSnake(obj[key]);
  }
  return newObj;
}

// Helper to format date string safely
const safeDateString = (dateVal, fallback = 'N/A') => {
  if (!dateVal) return fallback;
  const d = new Date(dateVal);
  return isNaN(d.getTime()) ? fallback : d.toLocaleDateString();
};

// Spreadsheet generation for booking details
async function generateBookingExcel(targetBookings, instrumentsList, usersList, isBulk) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(isBulk ? 'Bookings' : 'Booking');
  sheet.views = [{ showGridLines: true }];

  // Headers
  sheet.addRow([
    'SNo', 'Instrument Name', 'Model', 'Serial', 'Booked By', 'Start Date', 'Due Date',
    'Previous Insight', 'Remarks', 'Returned Date', 'Returned By', 'Return Notes'
  ]);

  let idx = 1;
  for (const b of targetBookings) {
    const inst = instrumentsList.find(i => String(i.id) === String(b.instrumentId)) || {};
    const user = usersList.find(u => String(u.id) === String(b.userId)) || {};
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

  const titleFont = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
  const fillPrimary = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E3A8A' } };
  const borderThin = {
    top: { style: 'thin', color: { argb: 'D1D5DB' } },
    left: { style: 'thin', color: { argb: 'D1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'D1D5DB' } },
    right: { style: 'thin', color: { argb: 'D1D5DB' } }
  };

  const headerRow = sheet.getRow(1);
  headerRow.height = 24;
  for (let i = 1; i <= 12; i++) {
    const cell = headerRow.getCell(i);
    cell.font = titleFont;
    cell.fill = fillPrimary;
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = borderThin;
  }

  // Format data rows
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber > 1) {
      row.height = 20;
      for (let i = 1; i <= 12; i++) {
        const cell = row.getCell(i);
        cell.font = { name: 'Arial', size: 10 };
        cell.border = borderThin;
        cell.alignment = { vertical: 'middle' };
      }
    }
  });

  // Dynamic sheets for bulk groups
  if (isBulk) {
    try {
      const calSheet = workbook.addWorksheet('CalibrationDue');
      calSheet.views = [{ showGridLines: true }];
      calSheet.addRow(['SNo', 'Instrument Name', 'Model', 'Serial', 'Next Calibration Date', 'Days Left']);

      const now = new Date();
      const cutoff = new Date(now.getTime() + 15 * 24 * 3600 * 1000);
      let cidx = 1;

      instrumentsList.forEach(i => {
        if (i.nextCalibrationDate) {
          const nd = new Date(i.nextCalibrationDate);
          if (nd >= now && nd <= cutoff) {
            calSheet.addRow([
              cidx++, i.name, i.model, i.serial, i.nextCalibrationDate,
              Math.ceil((nd - now) / (24 * 3600 * 1000))
            ]);
          }
        }
      });

      const calHeaderRow = calSheet.getRow(1);
      calHeaderRow.height = 24;
      for (let i = 1; i <= 6; i++) {
        const cell = calHeaderRow.getCell(i);
        cell.font = titleFont;
        cell.fill = fillPrimary;
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
        cell.border = borderThin;
      }
      calSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber > 1) {
          row.height = 20;
          for (let i = 1; i <= 6; i++) {
            const cell = row.getCell(i);
            cell.font = { name: 'Arial', size: 10 };
            cell.border = borderThin;
          }
        }
      });

      const firstB = targetBookings[0];
      const user = usersList.find(u => String(u.id) === String(firstB.userId)) || { name: 'Unknown User' };
      const sum = workbook.addWorksheet('Summary');
      sum.views = [{ showGridLines: true }];
      sum.addRow(['TotalBooked', targetBookings.length]);
      sum.addRow(['BookedBy', user.name]);
      sum.addRow(['StartDate', safeDateString(firstB.startDate)]);
      sum.addRow(['DueDate', safeDateString(firstB.dueDate)]);
      sum.addRow(['Remarks', firstB.remarks || '']);

      sum.eachRow({ includeEmpty: false }, (row) => {
        row.getCell(1).font = { name: 'Arial', size: 10, bold: true };
        row.getCell(2).font = { name: 'Arial', size: 10 };
        row.getCell(1).border = borderThin;
        row.getCell(2).border = borderThin;
      });
    } catch (err) {
      console.error('failed calibration/summary sheet', err);
    }
  }

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

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// Spreadsheet generation for extracted booking logs
async function generateExtractBookingExcel(targetBookings, instrumentsList, usersList) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Extracted Bookings');
  sheet.views = [{ showGridLines: true }];

  // Headers
  sheet.addRow([
    'SNo', 'Instrument Name', 'Model', 'Serial', 'Booked By', 'Start Date', 'Due Date',
    'Returned Date', 'Returned By', 'Return Notes', 'Original Remarks', 'Status'
  ]);

  let idx = 1;
  for (const b of targetBookings) {
    const inst = instrumentsList.find(i => String(i.id) === String(b.instrumentId)) || {};
    const user = usersList.find(u => String(u.id) === String(b.userId)) || {};

    sheet.addRow([
      idx++,
      inst.name || 'Unknown',
      inst.model || 'N/A',
      inst.serial || 'N/A',
      user.name || 'Unknown User',
      safeDateString(b.startDate),
      safeDateString(b.dueDate),
      b.returnedDate ? safeDateString(b.returnedDate) : 'Active',
      b.returnedByName || 'N/A',
      b.returnRemarks || '',
      b.remarks || '',
      b.status || 'approved'
    ]);
  }

  const titleFont = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFF' } };
  const fillPrimary = { type: 'pattern', pattern: 'solid', fgColor: { argb: '1E3A8A' } };
  const borderThin = {
    top: { style: 'thin', color: { argb: 'D1D5DB' } },
    left: { style: 'thin', color: { argb: 'D1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'D1D5DB' } },
    right: { style: 'thin', color: { argb: 'D1D5DB' } }
  };

  const headerRow = sheet.getRow(1);
  headerRow.height = 24;
  for (let i = 1; i <= 12; i++) {
    const cell = headerRow.getCell(i);
    cell.font = titleFont;
    cell.fill = fillPrimary;
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = borderThin;
  }

  // Format data rows
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber > 1) {
      row.height = 20;
      for (let i = 1; i <= 12; i++) {
        const cell = row.getCell(i);
        cell.font = { name: 'Arial', size: 10 };
        cell.border = borderThin;
        cell.alignment = { vertical: 'middle' };
      }
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

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// Spreadsheet generation for vendors directory
async function generateVendorsExcel(vendorIds, customDb) {
  const workbook = new ExcelJS.Workbook();

  for (const vId of vendorIds) {
    const vendor = (customDb.vendors || []).find(v => String(v.id) === String(vId));
    if (!vendor) continue;

    const products = (customDb.products || []).filter(p => String(p.vendorId) === String(vId));
    
    let sheetName = (vendor.name || 'Vendor').replace(/[*?:/\\\\[\]]/g, '');
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

    // Title block
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
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// Helper to normalize and enrich attendance records for both camelCase and snake_case consumers
function formatAttendanceRecord(r, users = []) {
  if (!r) return null;
  const empId = r.employee_id || r.employeeId || r.userId || r.user_id;
  const u = (users || []).find(x => String(x.id) === String(empId)) || {};

  // Calculate working hours
  let workingHours = 0;
  if (r.check_in && r.check_out) {
    const diff = (new Date(r.check_out) - new Date(r.check_in)) / 3600000;
    workingHours = Math.max(0, Math.round(diff * 100) / 100);
  } else if ((r.status || '').toLowerCase() === 'present') {
    workingHours = 8;
  } else if ((r.status || '').toLowerCase() === 'half_day') {
    workingHours = 4;
  }

  const remarks = r.remarks || '';
  const isLeaveOverride = remarks.includes('Attended during approved leave');
  let leaveReason = '';
  if (isLeaveOverride && remarks.includes('Attended during approved leave: ')) {
    leaveReason = remarks.replace('Attended during approved leave: ', '').trim();
  }

  const normStatus = (r.status || 'present').toLowerCase();

  return {
    id: r.id,
    userId: empId,
    employeeId: empId,
    userName: u.name || r.userName || r.user_name || '',
    employeeName: u.name || r.employeeName || r.userName || '',
    date: r.date,
    status: normStatus,
    checkIn: r.check_in || r.checkIn || null,
    checkOut: r.check_out || r.checkOut || null,
    workingHours: r.working_hours != null ? Number(r.working_hours) : (r.workingHours != null ? Number(r.workingHours) : workingHours),
    workLocation: r.work_location || r.workLocation || 'Office',
    remarks: remarks,
    approvedBy: r.approved_by || r.approvedBy || null,
    presentDespiteLeave: isLeaveOverride || Boolean(r.present_despite_leave || r.presentDespiteLeave),
    leavePresentReason: leaveReason || r.leave_present_reason || r.leavePresentReason || '',
    createdAt: r.created_at || r.createdAt || null,
    updatedAt: r.updated_at || r.updatedAt || null
  };
}

// Generate multi-sheet Excel for HR analytics & reporting
async function generateHRMultiSheetExcel(startDate, endDate, users, attendance, leaves, tasks) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IITM IEAC Workforce System';
  workbook.created = new Date();

  // Generate list of dates
  const dateList = [];
  let cur = new Date(startDate);
  const end = new Date(endDate);
  while (cur <= end) {
    dateList.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }

  const workingDaysList = dateList.filter(d => new Date(d).getDay() !== 0);
  const totalWorkingDays = Math.max(1, workingDaysList.length);

  // SHEET 1: Summary
  const summarySheet = workbook.addWorksheet('Summary & Attendance %', { views: [{ showGridLines: true }] });
  summarySheet.addRow(['IIT MADRAS - INDUSTRIAL ENERGY ASSESSMENT CELL']);
  summarySheet.addRow(['HR WORKFORCE ATTENDANCE & TASK PERFORMANCE SUMMARY']);
  summarySheet.addRow([`Report Period: ${startDate} to ${endDate} (${dateList.length} Calendar Days, ${totalWorkingDays} Working Days)`]);
  summarySheet.addRow([`Generated on: ${new Date().toLocaleString()}`]);
  summarySheet.addRow([]);

  const summaryHeaderRow = summarySheet.addRow([
    'S.No', 'Employee Name', 'Login / Mail ID', 'Designation / Role',
    'Total Period Days', 'Working Days', 'Days Present', 'Days Absent',
    'Attendance %', 'Tasks Completed', 'Total Tasks Assigned'
  ]);

  summaryHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summaryHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' };
  summaryHeaderRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  users.forEach((u, idx) => {
    const userAtt = attendance.filter(a => String(a.userId || a.employeeId) === String(u.id) && dateList.includes(a.date));
    const daysPresent = userAtt.filter(a => a.status === 'present' || a.checkIn).length;
    const daysAbsent = Math.max(0, totalWorkingDays - daysPresent);
    const attPct = Math.min(100, Math.round((daysPresent / totalWorkingDays) * 1000) / 10);

    const userTasks = tasks.filter(t => String(t.assignedTo) === String(u.id));
    const completedTasks = userTasks.filter(t => t.status === 'completed').length;

    const row = summarySheet.addRow([
      idx + 1,
      u.name || 'Unknown',
      u.email || '—',
      u.role || 'Staff',
      dateList.length,
      totalWorkingDays,
      daysPresent,
      daysAbsent,
      `${attPct}%`,
      completedTasks,
      userTasks.length
    ]);
    row.eachCell(c => {
      c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });
  });

  summarySheet.columns.forEach(col => { col.width = 22; });

  // SHEET 2...N: Day-wise sheets (limit to max 31 days)
  const displayDates = dateList.slice(0, 31);
  displayDates.forEach(dateStr => {
    const daySheet = workbook.addWorksheet(dateStr, { views: [{ showGridLines: true }] });
    daySheet.addRow([`IITM IEAC - DAILY WORKFORCE ATTENDANCE REPORT: ${dateStr}`]);
    daySheet.addRow([]);
    const dayHeader = daySheet.addRow([
      'S.No', 'Employee Name', 'Role', 'Status', 'Check In', 'Check Out', 'Hours Logged', 'Remarks'
    ]);
    dayHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    dayHeader.eachCell(c => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    });

    users.forEach((u, idx) => {
      const att = attendance.find(a => String(a.userId || a.employeeId) === String(u.id) && a.date === dateStr);
      const isPresent = att && (att.status === 'present' || att.checkIn);
      const isHalfDay = att && att.status === 'half_day';
      const statusText = isPresent ? (att?.presentDespiteLeave ? 'Present (Leave Override)' : 'Present') : (isHalfDay ? 'Half Day' : (att?.status === 'on_leave' ? 'On Leave' : 'Absent'));

      const r = daySheet.addRow([
        idx + 1,
        u.name || 'Unknown',
        u.role || 'Staff',
        statusText,
        att?.checkIn ? new Date(att.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
        att?.checkOut ? new Date(att.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
        att?.workingHours ? `${att.workingHours} hrs` : '—',
        att?.leavePresentReason ? `Attended despite leave: ${att.leavePresentReason}` : (att?.remarks || '—')
      ]);
      r.eachCell(c => {
        c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });
    });
    daySheet.columns.forEach(col => { col.width = 20; });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ----------------------------------------------------
// Global Interceptor logic for serverless deployment
// ----------------------------------------------------
const originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
  const urlStr = typeof url === 'string' ? url : url.url || '';
  
  if (!urlStr.startsWith('/api') && !urlStr.startsWith('/download') && !urlStr.includes('/api/')) {
    return originalFetch.apply(this, arguments);
  }

  // Parse method, query params, body
  const method = (options.method || 'GET').toUpperCase();
  const parsedUrl = new URL(urlStr, window.location.origin);
  const path = parsedUrl.pathname;
  const query = Object.fromEntries(parsedUrl.searchParams.entries());

  let body = {};
  if (options.body) {
    try {
      body = JSON.parse(options.body);
    } catch (_) {}
  }

  console.log(`[SUPABASE API INTERCEPTOR] ${method} ${path}`, { query, body });

  // Helpers to fetch current logged-in user profile cached in sessionStorage
  const getLoggedInUser = () => {
    const userStr = sessionStorage.getItem('iitm_user') || sessionStorage.getItem('user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch (e) {
      return null;
    }
  };

  const user = getLoggedInUser();

  const jsonResponse = (data, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const errorResponse = (msg, status = 400) => {
    return jsonResponse({ error: msg }, status);
  };

  // Auth Guard checking
  const isAuthRequired = path !== '/api/login' && path !== '/api/logout';
  if (isAuthRequired && !user) {
    return errorResponse('Authentication required.', 401);
  }

  const requireAdmin = () => {
    if (!user || (user.role || '').toLowerCase() !== 'admin') {
      return errorResponse('Access denied. Admin role required.', 403);
    }
    return null;
  };

  // Audit logger
  async function logAudit(action, tableName, recordId, details) {
    if (!user) return;
    try {
      await supabase.from('audit_logs').insert({
        user_id: user.id,
        user_email: user.email,
        action,
        table_name: tableName,
        record_id: recordId ? String(recordId) : null,
        details: typeof details === 'object' ? JSON.stringify(details) : details
      });
    } catch (err) {
      console.error('Audit logger failed:', err);
    }
  }

  // Instrument join helper
  async function getInstrumentsWithBookings() {
    const { data: instruments, error: instErr } = await supabase.from('inventory').select('*');
    if (instErr) throw instErr;

    const { data: bookings } = await supabase.from('purchase_orders').select('*');
    const { data: users } = await supabase.from('users').select('*');

    const mappedInstruments = snakeToCamel(instruments || []);
    const mappedBookings = snakeToCamel(bookings || []);
    const mappedUsers = snakeToCamel(users || []);

    return mappedInstruments.map(inst => {
      // Find active approved booking for the instrument
      const activeBooking = mappedBookings.find(b => 
        String(b.instrumentId) === String(inst.id) && 
        !b.returnedDate && 
        b.status === 'approved'
      );

      let bookedBy = null;
      let nextAvailableDate = null;
      if (activeBooking) {
        const u = mappedUsers.find(x => String(x.id) === String(activeBooking.userId));
        bookedBy = u ? u.name : 'Unknown User';
        nextAvailableDate = activeBooking.dueDate;
      }

      const futureBookings = mappedBookings
        .filter(b => 
          String(b.instrumentId) === String(inst.id) && 
          !b.returnedDate && 
          (b.status === 'approved' || b.status === 'pending') &&
          (!activeBooking || b.id !== activeBooking.id)
        )
        .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
        .map(b => {
          const u = mappedUsers.find(x => String(x.id) === String(b.userId));
          return {
            id: b.id,
            userName: u ? u.name : 'Unknown User',
            userId: b.userId,
            status: b.status,
            startDate: b.startDate,
            dueDate: b.dueDate,
            remarks: b.remarks
          };
        });

      return {
        ...inst,
        bookedBy,
        nextAvailableDate,
        futureBookings,
        nextBooking: futureBookings.length > 0 ? futureBookings[0] : null
      };
    });
  }

  // Helper to trigger real-time updates in the client
  async function broadcastMockUpdate() {
    if (window.__mock_socket) {
      try {
        const enriched = await getInstrumentsWithBookings();
        window.__mock_socket.emit('instruments', enriched);
        window.__mock_socket.emit('bookings');
      } catch (err) {
        console.error('Failed to broadcast mock update:', err);
      }
    }
  }

  try {
    // --- 1. AUTHENTICATION & LOGIN ---
    if (path === '/api/login' && method === 'POST') {
      const { email, password } = body;
      const trimmedEmail = (email || '').trim();
      const finalEmail = trimmedEmail.includes('@') ? trimmedEmail : `${trimmedEmail}@iitm.com`;

      let { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: finalEmail,
        password
      });

      // If user is not yet created in Supabase Auth (e.g. fresh database setup), auto-provision
      if (authErr && (authErr.message?.includes('Invalid login credentials') || authErr.message?.includes('User not found') || authErr.status === 400)) {
        const isAdminUser = finalEmail.startsWith('admin') || finalEmail.includes('admin');
        const role = isAdminUser ? 'admin' : 'engineer';
        const name = isAdminUser ? 'Admin User' : (trimmedEmail.split('@')[0] || 'Staff User');

        // Auto-provision user in auth.users
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email: finalEmail,
          password: password,
          options: {
            data: { name, role }
          }
        });

        if (!signUpErr && signUpData?.user) {
          authData = signUpData;
          authErr = null;
        }
      }

      if (authErr) {
        return errorResponse(authErr.message || 'Invalid credentials.', 401);
      }

      // Fetch user profile from public.users table
      let { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .maybeSingle();

      if (!profile) {
        const isAdminUser = finalEmail.startsWith('admin') || finalEmail.includes('admin');
        const role = isAdminUser ? 'admin' : 'engineer';
        const name = isAdminUser ? 'Admin User' : (trimmedEmail.split('@')[0] || 'Staff User');
        const { data: newProfile } = await supabase
          .from('users')
          .insert({
            id: authData.user.id,
            name,
            email: finalEmail,
            phone: '',
            role
          })
          .select()
          .maybeSingle();
        profile = newProfile;
      }

      const sessionUser = {
        id: authData.user.id,
        name: profile ? profile.name : (authData.user.user_metadata?.name || email),
        email: finalEmail,
        phone: profile ? profile.phone : (authData.user.user_metadata?.phone || ''),
        role: (profile ? profile.role : (authData.user.user_metadata?.role || 'admin')).toLowerCase()
      };

      sessionStorage.setItem('iitm_user', JSON.stringify(sessionUser));
      return jsonResponse(sessionUser);
    }

    if (path === '/api/logout' && method === 'POST') {
      await supabase.auth.signOut();
      sessionStorage.removeItem('iitm_user');
      sessionStorage.removeItem('iitm_active_view');
      return jsonResponse({ ok: true });
    }

    // --- 2. USER MANAGEMENT ---
    if (path === '/api/users') {
      if (method === 'GET') {
        const { data, error } = await supabase.from('users').select('*');
        if (error) return errorResponse(error.message);
        const normalized = (data || []).map(u => ({ ...u, role: (u.role || 'engineer').toLowerCase() }));
        return jsonResponse(snakeToCamel(normalized));
      }

      if (method === 'POST') {
        const err = requireAdmin();
        if (err) return err;

        const { name, email, phone, password, role } = body;
        const finalEmail = email.includes('@') ? email : `${email}@iitm.com`;

        // Register user via secondary client with persistSession: false
        const { data: regData, error: regErr } = await adminAuthClient.auth.signUp({
          email: finalEmail,
          password,
          options: {
            data: { name, phone, role }
          }
        });

        if (regErr) return errorResponse(regErr.message);

        // Try reading public.users for trigger completion, else insert manually
        let profile = null;
        for (let i = 0; i < 5; i++) {
          const { data } = await supabase.from('users').select('*').eq('id', regData.user.id).maybeSingle();
          if (data) {
            profile = data;
            break;
          }
          await new Promise(r => setTimeout(r, 200));
        }

        if (!profile) {
          const { data, error } = await supabase
            .from('users')
            .insert({
              id: regData.user.id,
              name,
              email: finalEmail,
              phone,
              role
            })
            .select()
            .single();
          if (error) return errorResponse(error.message);
          profile = data;
        }

        const profileWithLowerRole = { ...profile, role: (profile.role || 'engineer').toLowerCase() };
        await logAudit('CREATE', 'users', profile.id, profileWithLowerRole);
        await broadcastMockUpdate();
        return jsonResponse(snakeToCamel(profileWithLowerRole));
      }
    }

    if (path.startsWith('/api/users/') && method === 'PUT') {
      const err = requireAdmin();
      if (err) return err;

      const targetUserId = path.split('/').pop();
      const { name, email, phone, role } = body;

      const payload = {};
      if (name !== undefined) payload.name = name;
      if (email !== undefined) payload.email = email.includes('@') ? email : `${email}@iitm.com`;
      if (phone !== undefined) payload.phone = phone;
      if (role !== undefined) payload.role = role;

      const { data, error } = await supabase.from('users').update(payload).eq('id', targetUserId).select().single();
      if (error) return errorResponse(error.message);

      const updatedProfile = { ...data, role: (data.role || 'engineer').toLowerCase() };
      await logAudit('UPDATE', 'users', targetUserId, payload);
      await broadcastMockUpdate();
      return jsonResponse(snakeToCamel(updatedProfile));
    }

    if (path.startsWith('/api/users/') && method === 'DELETE') {
      const err = requireAdmin();
      if (err) return err;

      const targetUserId = path.split('/').pop();
      const { error } = await supabase.from('users').delete().eq('id', targetUserId);
      if (error) return errorResponse(error.message);

      await logAudit('DELETE', 'users', targetUserId, { id: targetUserId });
      await broadcastMockUpdate();
      return jsonResponse({ ok: true });
    }

    // --- 3. INSTRUMENTS (INVENTORY) ---
    if (path === '/api/instruments') {
      if (method === 'GET') {
        const enriched = await getInstrumentsWithBookings();
        return jsonResponse(enriched);
      }

      if (method === 'POST') {
        const err = requireAdmin();
        if (err) return err;

        const id = 'INST' + Math.random().toString(36).substring(2, 7).toUpperCase();
        const payload = camelToSnake({ id, ...body, status: 'available', location: 'warehouse' });

        const { data, error } = await supabase.from('inventory').insert(payload).select().single();
        if (error) return errorResponse(error.message);

        await logAudit('CREATE', 'inventory', id, payload);
        await broadcastMockUpdate();
        return jsonResponse(snakeToCamel(data));
      }
    }

    if (path.startsWith('/api/instruments/') && method === 'PUT') {
      const err = requireAdmin();
      if (err) return err;

      const instId = path.split('/').pop();
      const payload = camelToSnake(body);

      const { data, error } = await supabase.from('inventory').update(payload).eq('id', instId).select().single();
      if (error) return errorResponse(error.message);

      await logAudit('UPDATE', 'inventory', instId, payload);
      await broadcastMockUpdate();
      return jsonResponse(snakeToCamel(data));
    }

    if (path.startsWith('/api/instruments/') && method === 'DELETE') {
      const err = requireAdmin();
      if (err) return err;

      const instId = path.split('/').pop();
      const { error } = await supabase.from('inventory').delete().eq('id', instId);
      if (error) return errorResponse(error.message);

      await logAudit('DELETE', 'inventory', instId, { id: instId });
      await broadcastMockUpdate();
      return jsonResponse({ ok: true });
    }

    // --- 4. BOOKINGS / PURCHASE ORDERS ---
    if (path === '/api/book' && method === 'POST') {
      const { userId, instrumentId, startDate, endDate, dueDate, days, remarks } = body;
      const isUserAdmin = (user.role || '').toLowerCase() === 'admin';
      const status = isUserAdmin ? 'approved' : 'pending';
      const id = 'BK' + Math.random().toString(36).substring(2, 7).toUpperCase();
      const fileName = `booking-${id}-${Date.now()}.xlsx`;
      const sheetUrl = `/download/` + fileName;

      // Verify instrument is currently available
      const { data: targetInst } = await supabase.from('inventory').select('*').eq('id', instrumentId).single();
      if (!targetInst) return errorResponse('Instrument not found.', 404);
      if (targetInst.status !== 'available') {
        return errorResponse('This instrument is already booked.');
      }

      let finalStart, finalDue;
      const inputStart = startDate || body.startDate;
      const inputDue = dueDate || endDate || body.endDate || body.dueDate;

      if (inputStart && inputDue) {
        finalStart = new Date(inputStart).toISOString();
        finalDue = new Date(inputDue).toISOString();
      } else {
        const durationDays = Number(days || body.days) || 7;
        const now = new Date();
        finalStart = now.toISOString();
        finalDue = new Date(now.getTime() + durationDays * 24 * 3600 * 1000).toISOString();
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (new Date(finalStart) < today) {
        return errorResponse('Cannot book instrument for past dates.');
      }
      if (new Date(finalDue) < new Date(finalStart)) {
        return errorResponse('End date must be on or after start date.');
      }

      const payload = {
        id,
        user_id: userId,
        instrument_id: instrumentId,
        start_date: finalStart,
        due_date: finalDue,
        remarks: remarks || '',
        status,
        sheet_url: sheetUrl
      };

      const { data, error } = await supabase.from('purchase_orders').insert(payload).select().single();
      if (error) return errorResponse(error.message);

      if (isUserAdmin) {
        await supabase.from('inventory').update({ status: 'booked', location: 'with_user' }).eq('id', instrumentId);
      }

      await logAudit('CREATE', 'purchase_orders', id, payload);
      await broadcastMockUpdate();
      return jsonResponse(snakeToCamel(data));
    }

    if (path === '/api/book/bulk' && method === 'POST') {
      const { userId, instrumentIds = [], startDate, endDate, dueDate, days, remarks } = body;
      const isUserAdmin = (user.role || '').toLowerCase() === 'admin';
      const status = isUserAdmin ? 'approved' : 'pending';
      const bulkGroupId = 'GRP' + Math.random().toString(36).substring(2, 7).toUpperCase();
      const fileName = `booking-bulk-${bulkGroupId}-${Date.now()}.xlsx`;
      const sheetUrl = `/download/` + fileName;

      // Verify all selected instruments are available
      const { data: targetInsts } = await supabase.from('inventory').select('*').in('id', instrumentIds);
      const unavailable = (targetInsts || []).filter(i => i.status !== 'available');
      if (unavailable.length > 0) {
        return errorResponse('One or more selected instruments are already booked.');
      }

      let finalStart, finalDue;
      const inputStart = startDate || body.startDate;
      const inputDue = dueDate || endDate || body.endDate || body.dueDate;

      if (inputStart && inputDue) {
        finalStart = new Date(inputStart).toISOString();
        finalDue = new Date(inputDue).toISOString();
      } else {
        const durationDays = Number(days || body.days) || 7;
        const now = new Date();
        finalStart = now.toISOString();
        finalDue = new Date(now.getTime() + durationDays * 24 * 3600 * 1000).toISOString();
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (new Date(finalStart) < today) {
        return errorResponse('Cannot book instruments for past dates.');
      }
      if (new Date(finalDue) < new Date(finalStart)) {
        return errorResponse('End date must be on or after start date.');
      }

      const bookingRows = instrumentIds.map(instId => ({
        id: 'BK' + Math.random().toString(36).substring(2, 7).toUpperCase(),
        user_id: userId,
        instrument_id: instId,
        start_date: finalStart,
        due_date: finalDue,
        remarks: remarks || '',
        status,
        sheet_url: sheetUrl,
        bulk_group_id: bulkGroupId
      }));

      const { data, error } = await supabase.from('purchase_orders').insert(bookingRows).select();
      if (error) return errorResponse(error.message);

      if (isUserAdmin) {
        await supabase.from('inventory').update({ status: 'booked', location: 'with_user' }).in('id', instrumentIds);
      }

      await logAudit('CREATE_BULK', 'purchase_orders', bulkGroupId, bookingRows);
      await broadcastMockUpdate();
      return jsonResponse(snakeToCamel(data));
    }

    if (path === '/api/booking-requests' && method === 'GET') {
      const { data: rawBookings, error } = await supabase.from('purchase_orders').select('*').eq('status', 'pending');
      if (error) return errorResponse(error.message);

      const { data: dbUsers } = await supabase.from('users').select('*');
      const { data: dbInstruments } = await supabase.from('inventory').select('*');

      const bookings = snakeToCamel(rawBookings || []);
      const users = snakeToCamel(dbUsers || []);
      const instruments = snakeToCamel(dbInstruments || []);

      // Group: key = bulkGroupId (for bulk) or bookingId (for single)
      const groups = {};
      for (const b of bookings) {
        const key = b.bulkGroupId || b.id;
        if (!groups[key]) groups[key] = [];
        groups[key].push(b);
      }

      const result = Object.entries(groups).map(([requestId, bookingsList]) => {
        const first = bookingsList[0];
        const userObj = users.find(u => String(u.id) === String(first.userId)) || {};
        const isBulk = !!first.bulkGroupId;
        const instrumentList = bookingsList.map(b => {
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
          userName: userObj.name || 'Unknown User',
          userEmail: userObj.email || 'N/A',
          instruments: instrumentList,
          startDate: first.startDate,
          dueDate: first.dueDate,
          remarks: first.remarks,
          status: 'pending'
        };
      });

      return jsonResponse(result);
    }

    if (path.includes('/api/booking-requests/') && path.endsWith('/approve') && method === 'POST') {
      const err = requireAdmin();
      if (err) return err;

      const reqId = path.split('/')[3];
      
      // Check if this is a bulk group
      const { data: bulkBookings } = await supabase.from('purchase_orders').select('*').eq('bulk_group_id', reqId).eq('status', 'pending');
      
      if (bulkBookings && bulkBookings.length > 0) {
        // Approve all in bulk group
        const instrumentIds = bulkBookings.map(b => b.instrument_id);
        await supabase.from('purchase_orders').update({ status: 'approved' }).eq('bulk_group_id', reqId);
        await supabase.from('inventory').update({ status: 'booked', location: 'with_user' }).in('id', instrumentIds);
        
        await logAudit('APPROVE_BULK', 'purchase_orders', reqId, bulkBookings);
      } else {
        // Single booking approval
        const { data: booking, error: fetchErr } = await supabase.from('purchase_orders').select('*').eq('id', reqId).single();
        if (fetchErr || !booking) return errorResponse('Booking request not found.', 404);

        await supabase.from('purchase_orders').update({ status: 'approved' }).eq('id', reqId);
        await supabase.from('inventory').update({ status: 'booked', location: 'with_user' }).eq('id', booking.instrument_id);
        
        await logAudit('APPROVE', 'purchase_orders', reqId, booking);
      }
      
      await broadcastMockUpdate();
      return jsonResponse({ ok: true });
    }

    if (path.includes('/api/booking-requests/') && path.endsWith('/deny') && method === 'POST') {
      const err = requireAdmin();
      if (err) return err;

      const reqId = path.split('/')[3];

      // Check if this is a bulk group
      const { data: bulkBookings } = await supabase.from('purchase_orders').select('*').eq('bulk_group_id', reqId).eq('status', 'pending');

      if (bulkBookings && bulkBookings.length > 0) {
        const instrumentIds = bulkBookings.map(b => b.instrument_id);
        await supabase.from('purchase_orders').update({ status: 'denied' }).eq('bulk_group_id', reqId);
        await supabase.from('inventory').update({ status: 'available', location: 'warehouse' }).in('id', instrumentIds);
        
        await logAudit('DENY_BULK', 'purchase_orders', reqId, bulkBookings);
      } else {
        // Single booking deny
        const { data: booking, error: fetchErr } = await supabase.from('purchase_orders').select('*').eq('id', reqId).single();
        if (fetchErr || !booking) return errorResponse('Booking request not found.', 404);

        await supabase.from('purchase_orders').update({ status: 'denied' }).eq('id', reqId);
        await supabase.from('inventory').update({ status: 'available', location: 'warehouse' }).eq('id', booking.instrument_id);
        
        await logAudit('DENY', 'purchase_orders', reqId, booking);
      }

      await broadcastMockUpdate();
      return jsonResponse({ ok: true });
    }

    if (path === '/api/return' && method === 'POST') {
      const { instrumentId, remarks } = body;

      const { data: activeBookings } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('instrument_id', instrumentId)
        .is('returned_date', null)
        .eq('status', 'approved');

      if (!activeBookings || activeBookings.length === 0) {
        return errorResponse('Active booking not found for return.', 404);
      }

      const booking = activeBookings[0];
      const returnedDate = new Date().toISOString();

      const updateData = {
        returned_date: returnedDate,
        due_date: returnedDate,
        returned_by_name: user.name,
        return_remarks: remarks || ''
      };

      await supabase.from('purchase_orders').update(updateData).eq('id', booking.id);

      const instUpdate = { status: 'available', location: 'warehouse' };
      if (remarks) instUpdate.last_insight = remarks;
      await supabase.from('inventory').update(instUpdate).eq('id', instrumentId);

      await logAudit('RETURN', 'purchase_orders', booking.id, updateData);
      await broadcastMockUpdate();
      return jsonResponse({ ok: true });
    }

    if (path === '/api/return/bulk' && method === 'POST') {
      const { instrumentIds = [], remarks } = body;
      const returnedDate = new Date().toISOString();

      for (const instId of instrumentIds) {
        const { data: activeBookings } = await supabase
          .from('purchase_orders')
          .select('*')
          .eq('instrument_id', instId)
          .is('returned_date', null)
          .eq('status', 'approved');

        if (!activeBookings || activeBookings.length === 0) continue;

        const booking = activeBookings[0];
        const updateData = {
          returned_date: returnedDate,
          due_date: returnedDate,
          returned_by_name: user.name,
          return_remarks: remarks || ''
        };

        await supabase.from('purchase_orders').update(updateData).eq('id', booking.id);

        const instUpdate = { status: 'available', location: 'warehouse' };
        if (remarks) instUpdate.last_insight = remarks;
        await supabase.from('inventory').update(instUpdate).eq('id', instId);

        await logAudit('RETURN', 'purchase_orders', booking.id, updateData);
      }

      await broadcastMockUpdate();
      return jsonResponse({ ok: true });
    }

    // --- 5. CALIBRATION & INSIGHTS ---
    if (path === '/api/calibration/due' && method === 'GET') {
      const days = 15;
      const now = new Date();
      const cutoff = new Date(now.getTime() + days * 24 * 3600 * 1000);

      const { data, error } = await supabase.from('inventory').select('*').not('next_calibration_date', 'is', null);
      if (error) return errorResponse(error.message);

      const filtered = (data || []).filter(i => {
        const nd = new Date(i.next_calibration_date);
        return nd >= now && nd <= cutoff;
      });

      return jsonResponse(snakeToCamel(filtered));
    }

    if (path === '/api/calibrations' && method === 'GET') {
      const { data, error } = await supabase.from('inventory').select('*');
      if (error) return errorResponse(error.message);

      const rows = (data || []).map(i => {
        const next = i.next_calibration_date || null;
        const dueIn = next ? (new Date(next) - new Date()) : null;
        return {
          ...snakeToCamel(i),
          dueInMilliseconds: dueIn
        };
      });

      return jsonResponse(rows);
    }

    if (path === '/api/calibrate' && method === 'POST') {
      const { instrumentId, certificateUrl, cycleDays } = body;
      const now = new Date();
      const days = Number(cycleDays) || 365;
      const next = new Date(now.getTime() + days * 24 * 3600 * 1000);

      const updateData = {
        last_calibration_date: now.toISOString(),
        next_calibration_date: next.toISOString(),
        calibration_cycle_days: days
      };
      if (certificateUrl) updateData.calibration_certificate_url = certificateUrl;

      const { data, error } = await supabase.from('inventory').update(updateData).eq('id', instrumentId).select().single();
      if (error) return errorResponse(error.message);

      await logAudit('CALIBRATE', 'inventory', instrumentId, updateData);
      await broadcastMockUpdate();
      return jsonResponse({ ok: true });
    }

    if (path === '/api/instrument/insight' && method === 'POST') {
      const { instrumentId, insight } = body;

      const { data, error } = await supabase.from('inventory').update({ last_insight: insight }).eq('id', instrumentId).select().single();
      if (error) return errorResponse(error.message);

      await logAudit('INSIGHT', 'inventory', instrumentId, { last_insight: insight });
      await broadcastMockUpdate();
      return jsonResponse(snakeToCamel(data));
    }

    // --- 6. TRANSACTIONS ---
    if (path === '/api/bookings' && method === 'GET') {
      const { data: bookings, error } = await supabase.from('purchase_orders').select('*');
      if (error) return errorResponse(error.message);

      const { data: instruments } = await supabase.from('inventory').select('*');
      const { data: users } = await supabase.from('users').select('*');

      const enriched = (bookings || []).map(b => {
        const inst = (instruments || []).find(i => String(i.id) === String(b.instrument_id)) || {};
        const requester = (users || []).find(u => String(u.id) === String(b.user_id)) || {};
        return {
          ...snakeToCamel(b),
          userName: requester.name || 'Unknown User',
          instrumentName: inst.name || 'Unknown',
          instrumentModel: inst.model || 'N/A',
          instrumentSerial: inst.serial || 'N/A',
          instrumentImage: Array.isArray(inst.product_images) ? inst.product_images[0] : null
        };
      });

      enriched.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
      return jsonResponse(enriched);
    }

    if (path.startsWith('/api/bookings/') && method === 'DELETE') {
      const err = requireAdmin();
      if (err) return err;

      const subpath = path.replace('/api/bookings/', '');
      if (subpath.startsWith('group/')) {
        const groupId = subpath.replace('group/', '');
        const { error } = await supabase.from('purchase_orders').delete().eq('bulk_group_id', groupId);
        if (error) return errorResponse(error.message);
        await logAudit('DELETE_BULK', 'purchase_orders', groupId, { bulk_group_id: groupId });
      } else {
        const bookingId = subpath;
        const { error } = await supabase.from('purchase_orders').delete().eq('id', bookingId);
        if (error) return errorResponse(error.message);
        await logAudit('DELETE', 'purchase_orders', bookingId, { id: bookingId });
      }
      await broadcastMockUpdate();
      return jsonResponse({ ok: true });
    }

    if (path === '/api/admin/clear-bookings' && method === 'POST') {
      const err = requireAdmin();
      if (err) return err;

      const { error } = await supabase.from('purchase_orders').delete().neq('id', 'dummy');
      if (error) return errorResponse(error.message);

      await logAudit('CLEAR_ALL', 'purchase_orders', null, {});
      return jsonResponse({ ok: true });
    }

    if (path === '/api/admin/extract-bookings' && method === 'GET') {
      const err = requireAdmin();
      if (err) return err;

      const { start, end } = query;
      if (!start || !end) {
        return errorResponse('Start date and End date are required.', 400);
      }

      const fileName = `booking-extract-${start}-${end}.xlsx`;
      const sheetUrl = `/download/` + fileName;

      return jsonResponse({ ok: true, sheet: sheetUrl });
    }

    // --- 7. VENDORS, PRODUCTS & UTILITIES ---
    if (path === '/api/vendors') {
      if (method === 'GET') {
        const q = (query.q || '').trim().toLowerCase();
        const utilityFilter = (query.utility || '').trim().toLowerCase();
        const vendorFilter = (query.vendor || '').trim();
        const productFilter = (query.product || '').trim().toLowerCase();
        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 10;

        // Try the RPC first, fallback to direct table query if RPC not available
        let vendors = [];
        let products = [];
        const { data: rpcData, error: rpcErr } = await supabase.rpc('search_vendors', {
          search_query: q,
          utility_filter: utilityFilter,
          vendor_filter: vendorFilter,
          product_filter: productFilter,
          page_num: page,
          page_size: limit,
          sort_by: 'name',
          sort_order: 'asc'
        });

        if (!rpcErr && rpcData) {
          // RPC succeeded - use its results
          const total = rpcData.length > 0 ? rpcData[0].total_count : 0;
          const mapped = rpcData.map(v => ({
            id: v.id,
            name: v.name,
            companyName: v.company_name,
            vendorType: v.vendor_type,
            status: v.status,
            contactPerson: v.contact_person,
            mobileNumber: v.mobile_number,
            alternativeMobileNumber: v.alternative_mobile_number,
            email: v.email,
            website: v.website,
            streetAddress: v.street_address,
            city: v.city,
            state: v.state,
            country: v.country,
            pinCode: v.pin_code,
            gstin: v.gstin,
            pan: v.pan,
            businessRegNo: v.business_reg_no,
            remarks: v.remarks,
            productCount: v.product_count,
            createdAt: v.created_at,
            products: []
          }));
          return jsonResponse({ vendors: mapped, total, page, limit, totalPages: Math.ceil(total / limit) });
        }

        // Fallback: direct table query (works even without the RPC deployed)
        const { data: allVendors, error: vErr } = await supabase.from('vendors').select('*').order('name');
        if (vErr) return errorResponse(vErr.message);
        vendors = allVendors || [];

        if (productFilter || utilityFilter) {
          const { data: allProducts } = await supabase.from('products').select('*');
          products = allProducts || [];
        }

        // Client-side filtering
        let filtered = vendors.filter(v => {
          const matchesSearch = !q || [v.name, v.company_name, v.contact_person, v.city].some(
            f => f && f.toLowerCase().includes(q)
          );
          const matchesVendor = !vendorFilter || v.id === vendorFilter;
          let matchesProduct = true;
          let matchesUtility = true;
          if ((productFilter || utilityFilter) && products.length > 0) {
            const vProds = products.filter(p => p.vendor_id === v.id);
            if (productFilter) matchesProduct = vProds.some(p => (p.name || '').toLowerCase().includes(productFilter));
            if (utilityFilter) matchesUtility = vProds.some(p => (p.utility_name || '').toLowerCase().includes(utilityFilter));
          }
          return matchesSearch && matchesVendor && matchesProduct && matchesUtility;
        });

        const total = filtered.length;
        const paginated = filtered.slice((page - 1) * limit, page * limit);

        // Fetch product counts
        const { data: allProducts2 } = await supabase.from('products').select('vendor_id');
        const productCounts = {};
        (allProducts2 || []).forEach(p => { productCounts[p.vendor_id] = (productCounts[p.vendor_id] || 0) + 1; });

        const mapped = paginated.map(v => ({
          id: v.id,
          name: v.name,
          companyName: v.company_name,
          vendorType: v.vendor_type,
          status: v.status,
          contactPerson: v.contact_person,
          mobileNumber: v.mobile_number,
          alternativeMobileNumber: v.alternative_mobile_number,
          email: v.email,
          website: v.website,
          streetAddress: v.street_address,
          city: v.city,
          state: v.state,
          country: v.country,
          pinCode: v.pin_code,
          gstin: v.gstin,
          pan: v.pan,
          businessRegNo: v.business_reg_no,
          remarks: v.remarks,
          productCount: productCounts[v.id] || 0,
          createdAt: v.created_at,
          products: []
        }));

        return jsonResponse({ vendors: mapped, total, page, limit, totalPages: Math.ceil(total / limit) });
      }

      if (method === 'POST') {
        const err = requireAdmin();
        if (err) return err;

        const id = 'VND' + Math.random().toString(36).substring(2, 7).toUpperCase();
        const payload = camelToSnake({ id, ...body });

        const { data, error } = await supabase.from('vendors').insert(payload).select().single();
        if (error) return errorResponse(error.message);

        await logAudit('CREATE', 'vendors', id, payload);
        return jsonResponse(snakeToCamel(data));
      }
    }

    if (path.startsWith('/api/vendors/')) {
      const sub = path.replace('/api/vendors/', '');
      const parts = sub.split('/');
      const vendorId = parts[0];

      if (parts.length === 1) {
        if (method === 'GET') {
          const { data: vendor, error: vErr } = await supabase.from('vendors').select('*').eq('id', vendorId).single();
          if (vErr || !vendor) return errorResponse('Vendor profile not found.', 404);

          const { data: products } = await supabase.from('products').select('*').eq('vendor_id', vendorId);

          return jsonResponse({
            ...snakeToCamel(vendor),
            products: snakeToCamel(products || []),
            productCount: (products || []).length
          });
        }

        if (method === 'PUT') {
          const err = requireAdmin();
          if (err) return err;

          const payload = camelToSnake(body);
          const { data, error } = await supabase.from('vendors').update(payload).eq('id', vendorId).select().single();
          if (error) return errorResponse(error.message);

          await logAudit('UPDATE', 'vendors', vendorId, payload);
          return jsonResponse(snakeToCamel(data));
        }

        if (method === 'DELETE') {
          const err = requireAdmin();
          if (err) return err;

          const { error } = await supabase.from('vendors').delete().eq('id', vendorId);
          if (error) return errorResponse(error.message);

          await logAudit('DELETE', 'vendors', vendorId, { id: vendorId });
          return jsonResponse({ ok: true });
        }
      } else if (parts[1] === 'products') {
        if (method === 'POST') {
          const err = requireAdmin();
          if (err) return err;

          const productId = 'PRD' + Math.random().toString(36).substring(2, 7).toUpperCase();
          const payload = camelToSnake({ id: productId, vendorId, ...body });

          const { data, error } = await supabase.from('products').insert(payload).select().single();
          if (error) return errorResponse(error.message);

          await logAudit('CREATE', 'products', productId, payload);
          return jsonResponse(snakeToCamel(data));
        }

        const productId = parts[2];

        if (method === 'PUT') {
          const err = requireAdmin();
          if (err) return err;

          const payload = camelToSnake(body);
          const { data, error } = await supabase
            .from('products')
            .update(payload)
            .eq('id', productId)
            .eq('vendor_id', vendorId)
            .select()
            .single();

          if (error) return errorResponse(error.message);

          await logAudit('UPDATE', 'products', productId, payload);
          return jsonResponse(snakeToCamel(data));
        }

        if (method === 'DELETE') {
          const err = requireAdmin();
          if (err) return err;

          const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', productId)
            .eq('vendor_id', vendorId);

          if (error) return errorResponse(error.message);

          await logAudit('DELETE', 'products', productId, { id: productId });
          return jsonResponse({ ok: true });
        }
      }
    }

    if (path === '/api/utilities') {
      if (method === 'GET') {
        const { data, error } = await supabase.from('utilities').select('*');
        if (error) return errorResponse(error.message);
        return jsonResponse(snakeToCamel(data));
      }

      if (method === 'POST') {
        const err = requireAdmin();
        if (err) return err;

        const { name } = body;
        const norm = name.toLowerCase().trim();

        // Check utility uniqueness case-insensitively
        const { data: existing } = await supabase.from('utilities').select('*').eq('id', norm).maybeSingle();
        if (existing) return jsonResponse(snakeToCamel(existing));

        const { data, error } = await supabase.from('utilities').insert({ id: norm, name: name.trim() }).select().single();
        if (error) return errorResponse(error.message);

        await logAudit('CREATE', 'utilities', norm, { id: norm, name });
        return jsonResponse(snakeToCamel(data));
      }
    }

    // --- 8. EXCEL EXPORTS (Dynamic) ---
    if (path === '/api/vendors/export' && method === 'POST') {
      const { vendorIds } = body;
      if (!vendorIds || !Array.isArray(vendorIds) || vendorIds.length === 0) {
        return errorResponse('No vendors selected for export.');
      }

      // Fetch vendors and products to compile workbook in-browser
      const { data: vendors } = await supabase.from('vendors').select('*').in('id', vendorIds);
      const { data: products } = await supabase.from('products').select('*');

      const customDb = {
        vendors: snakeToCamel(vendors || []),
        products: snakeToCamel(products || [])
      };

      const blob = await generateVendorsExcel(vendorIds, customDb);
      return new Response(blob, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="vendors_export.xlsx"'
        }
      });
    }

    // --- 9. TASKS MODULE ---
    if (path === '/api/tasks') {
      if (method === 'GET') {
        const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
        if (error) return errorResponse(error.message);
        return jsonResponse(snakeToCamel(data || []));
      }
      if (method === 'POST') {
        const taskData = {
          id: 'TSK-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
          title: body.title || 'Untitled Task',
          description: body.description || '',
          assigned_to: body.assignedTo || body.assigned_to || user?.id || 'admin',
          assigned_by: user?.id || 'admin',
          department: body.department || 'Audit',
          priority: body.priority || 'Medium',
          status: body.status || 'pending',
          due_date: body.dueDate || body.due_date || new Date().toISOString(),
          estimated_hours: Number(body.estimatedHours || 0),
          actual_hours: Number(body.actualHours || 0),
          remarks: body.remarks || '',
          history: JSON.stringify([{ action: 'Created task', timestamp: new Date().toISOString(), user: user?.name || 'Staff' }])
        };
        const { data, error } = await supabase.from('tasks').insert(taskData).select().single();
        if (error) return errorResponse(error.message);
        return jsonResponse(snakeToCamel(data));
      }
    }
    if (path.startsWith('/api/tasks/')) {
      const taskId = path.replace('/api/tasks/', '').split('/')[0];
      if (method === 'PUT') {
        const updateData = {};
        if (body.title !== undefined) updateData.title = body.title;
        if (body.description !== undefined) updateData.description = body.description;
        if (body.status !== undefined) updateData.status = body.status;
        if (body.priority !== undefined) updateData.priority = body.priority;
        if (body.dueDate !== undefined) updateData.due_date = body.dueDate;
        if (body.actualHours !== undefined) updateData.actual_hours = Number(body.actualHours);
        if (body.completedAt !== undefined) updateData.completed_at = body.completedAt;
        const { data, error } = await supabase.from('tasks').update(updateData).eq('id', taskId).select().single();
        if (error) return errorResponse(error.message);
        return jsonResponse(snakeToCamel(data));
      }
      if (method === 'DELETE') {
        const { error } = await supabase.from('tasks').delete().eq('id', taskId);
        if (error) return errorResponse(error.message);
        return jsonResponse({ ok: true });
      }
    }

    // --- 10. LEAVES & HOLIDAYS MODULE ---
    if (path === '/api/leave-types') {
      const { data, error } = await supabase.from('leave_types').select('*').order('name');
      if (error) return errorResponse(error.message);
      return jsonResponse(snakeToCamel(data || []));
    }

    if (path === '/api/holidays') {
      if (method === 'GET') {
        const { data, error } = await supabase.from('holidays').select('*').order('date');
        if (error) return errorResponse(error.message);
        return jsonResponse(snakeToCamel(data || []));
      }
      if (method === 'POST') {
        const hol = {
          id: 'HOL-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
          name: body.name,
          date: body.date,
          type: body.type || 'National',
          year: new Date(body.date).getFullYear(),
          is_optional: Boolean(body.isOptional),
          description: body.description || '',
          status: 'active'
        };
        const { data, error } = await supabase.from('holidays').insert(hol).select().single();
        if (error) return errorResponse(error.message);
        return jsonResponse(snakeToCamel(data));
      }
    }
    if (path.startsWith('/api/holidays/') && method === 'DELETE') {
      const hId = path.replace('/api/holidays/', '');
      const { error } = await supabase.from('holidays').delete().eq('id', hId);
      if (error) return errorResponse(error.message);
      return jsonResponse({ ok: true });
    }

    if (path === '/api/leave-requests') {
      if (method === 'GET') {
        const { data, error } = await supabase.from('leave_requests').select('*').order('applied_at', { ascending: false });
        if (error) return errorResponse(error.message);
        return jsonResponse(snakeToCamel(data || []));
      }
      if (method === 'POST') {
        const lr = {
          id: 'LR-' + Math.random().toString(36).substring(2, 9).toUpperCase(),
          employee_id: body.employeeId || body.employee_id || user?.id || 'emp-1',
          leave_type_id: body.leaveTypeId || body.leave_type_id || 'LT-CL',
          start_date: body.startDate || body.start_date,
          end_date: body.endDate || body.end_date,
          days: Number(body.days || 1),
          reason: body.reason || '',
          status: 'pending'
        };
        const { data, error } = await supabase.from('leave_requests').insert(lr).select().single();
        if (error) return errorResponse(error.message);
        return jsonResponse(snakeToCamel(data));
      }
    }

    if (path.startsWith('/api/leave-requests/')) {
      const sub = path.replace('/api/leave-requests/', '');
      const [lrId, action] = sub.split('/');
      if (action === 'approve') {
        const { data, error } = await supabase.from('leave_requests').update({ status: 'approved', approved_by: user?.name || 'HR Admin', approved_at: new Date().toISOString() }).eq('id', lrId).select().single();
        if (error) return errorResponse(error.message);
        return jsonResponse(snakeToCamel(data));
      }
      if (action === 'reject') {
        const { data, error } = await supabase.from('leave_requests').update({ status: 'rejected', approved_by: user?.name || 'HR Admin', approved_at: new Date().toISOString(), remarks: body.remarks || 'Rejected' }).eq('id', lrId).select().single();
        if (error) return errorResponse(error.message);
        return jsonResponse(snakeToCamel(data));
      }
      if (action === 'cancel') {
        const { data, error } = await supabase.from('leave_requests').update({ status: 'cancelled' }).eq('id', lrId).select().single();
        if (error) return errorResponse(error.message);
        return jsonResponse(snakeToCamel(data));
      }
    }

    // --- 11. ATTENDANCE & AVAILABILITY MODULE ---

    // 11.1 Today's attendance for the logged-in user
    if (path === '/api/attendance/today' && method === 'GET') {
      const today = new Date().toISOString().slice(0, 10);
      const targetUserId = user?.id;
      if (!targetUserId) return jsonResponse(null);

      const { data, error } = await supabase.from('attendance')
        .select('*')
        .eq('employee_id', targetUserId)
        .eq('date', today)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') return errorResponse(error.message);
      if (!data) return jsonResponse(null);

      const { data: usersList } = await supabase.from('users').select('*');
      return jsonResponse(formatAttendanceRecord(data, usersList || []));
    }

    // 11.2 Check-in for logged-in user
    if (path === '/api/attendance/checkin' && method === 'POST') {
      if (!user) return errorResponse('Authentication required.', 401);
      const today = new Date().toISOString().slice(0, 10);
      const { data: existing } = await supabase.from('attendance')
        .select('*')
        .eq('employee_id', user.id)
        .eq('date', today)
        .maybeSingle();

      if (existing && existing.check_in) {
        return errorResponse('Already checked in today.', 400);
      }

      const now = new Date().toISOString();
      const attId = existing?.id || ('ATT-' + user.id + '-' + today);
      const payload = {
        id: attId,
        employee_id: user.id,
        date: today,
        status: 'present',
        check_in: now,
        work_location: body.workLocation || 'Office',
        remarks: body.remarks || 'Web portal check-in',
        updated_at: now
      };

      const { data, error } = await supabase.from('attendance').upsert(payload).select().single();
      if (error) return errorResponse(error.message);

      try { await logAudit('ATTENDANCE_CHECKIN', 'attendance', attId, { date: today, time: now }); } catch (_) {}
      const { data: usersList } = await supabase.from('users').select('*');
      return jsonResponse(formatAttendanceRecord(data, usersList || []));
    }

    // 11.3 Check-out for logged-in user
    if (path === '/api/attendance/checkout' && method === 'POST') {
      if (!user) return errorResponse('Authentication required.', 401);
      const today = new Date().toISOString().slice(0, 10);
      const { data: existing } = await supabase.from('attendance')
        .select('*')
        .eq('employee_id', user.id)
        .eq('date', today)
        .maybeSingle();

      if (!existing || !existing.check_in) {
        return errorResponse('Please check in first.', 400);
      }
      if (existing.check_out) {
        return errorResponse('Already checked out today.', 400);
      }

      const now = new Date().toISOString();
      const diffHours = Math.max(0, Math.round(((new Date(now) - new Date(existing.check_in)) / 3600000) * 100) / 100);
      const { data, error } = await supabase.from('attendance').update({
        check_out: now,
        working_hours: diffHours,
        status: 'present',
        updated_at: now
      }).eq('id', existing.id).select().single();

      if (error) return errorResponse(error.message);

      try { await logAudit('ATTENDANCE_CHECKOUT', 'attendance', existing.id, { date: today, time: now }); } catch (_) {}
      const { data: usersList } = await supabase.from('users').select('*');
      return jsonResponse(formatAttendanceRecord(data, usersList || []));
    }

    // 11.4 HR Manual Attendance Override (Mark Present / Absent / Half-day / On-leave)
    if (path === '/api/hr/attendance/mark' && method === 'POST') {
      const role = (user?.role || '').toLowerCase();
      if (role !== 'admin' && role !== 'hr' && role !== 'manager') {
        return errorResponse('Access denied. HR or Admin role required.', 403);
      }
      const targetUserId = body.userId || body.employeeId;
      const { date, status, checkIn, checkOut, remarks } = body;
      if (!targetUserId || !date || !status) {
        return errorResponse('User ID, date, and status are required.', 400);
      }

      const normStatus = (status || '').toLowerCase();
      const validStatuses = ['present', 'absent', 'half_day', 'on_leave'];
      if (!validStatuses.includes(normStatus)) {
        return errorResponse(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
      }

      const now = new Date().toISOString();
      const attId = 'ATT-' + targetUserId + '-' + date;
      const payload = {
        id: attId,
        employee_id: targetUserId,
        date,
        status: normStatus,
        check_in: normStatus === 'present' ? (checkIn || `${date}T09:00:00.000Z`) : null,
        check_out: normStatus === 'present' ? (checkOut || `${date}T18:00:00.000Z`) : null,
        remarks: remarks || `Manually marked ${normStatus} by HR (${user.email || user.role})`,
        approved_by: user.name || user.email || 'HR Admin',
        updated_at: now
      };

      const { data, error } = await supabase.from('attendance').upsert(payload).select().single();
      if (error) return errorResponse(error.message);

      await logAudit('HR_ATTENDANCE_OVERRIDE', 'attendance', attId, {
        targetUserId,
        date,
        status: normStatus,
        remarks
      });

      const { data: usersList } = await supabase.from('users').select('*');
      return jsonResponse({ ok: true, record: formatAttendanceRecord(data, usersList || []) });
    }

    // 11.5 Active Leave Attendance Reason Submission
    if (path === '/api/attendance/leave-present-reason' && method === 'POST') {
      if (!user) return errorResponse('Authentication required.', 401);
      const { reason, date = new Date().toISOString().slice(0, 10) } = body;
      if (!reason || !reason.trim()) {
        return errorResponse('Reason for attending today is required.', 400);
      }

      const now = new Date().toISOString();
      const attId = 'ATT-' + user.id + '-' + date;
      const payload = {
        id: attId,
        employee_id: user.id,
        date,
        status: 'present',
        check_in: now,
        check_out: null,
        remarks: `Attended during approved leave: ${reason.trim()}`,
        updated_at: now
      };

      const { data, error } = await supabase.from('attendance').upsert(payload).select().single();
      if (error) return errorResponse(error.message);

      // Notify Admins and HR
      const { data: allUsers } = await supabase.from('users').select('*');
      const recipients = (allUsers || []).filter(u => ['admin', 'hr'].includes((u.role || '').toLowerCase()));
      for (const adm of recipients) {
        try {
          await supabase.from('notifications').insert({
            id: 'NOT-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
            user_id: adm.id,
            title: 'Active Leave Attendance Alert',
            message: `${user.name || 'Employee'} logged in and attended work today (${date}) despite an approved leave. Reason: "${reason.trim()}"`,
            type: 'leave_alert',
            link: '/attendance',
            created_at: now
          });
        } catch (_) {}
      }

      await logAudit('LEAVE_OVERRIDE_PRESENT', 'attendance', attId, { reason: reason.trim() });
      return jsonResponse({
        ok: true,
        message: 'Reason recorded and attendance marked as present.',
        record: formatAttendanceRecord(data, allUsers || [])
      });
    }

    // 11.6 Attendance List / All records
    if (path === '/api/attendance') {
      if (method === 'GET') {
        const { data: attList, error: attErr } = await supabase.from('attendance').select('*').order('date', { ascending: false });
        if (attErr) return errorResponse(attErr.message);
        const { data: usersList } = await supabase.from('users').select('*');
        const formatted = (attList || []).map(a => formatAttendanceRecord(a, usersList || []));
        return jsonResponse(formatted);
      }
      if (method === 'POST') {
        const targetUserId = body.userId || body.employeeId || user?.id || 'emp-1';
        const targetDate = body.date || new Date().toISOString().split('T')[0];
        const attId = 'ATT-' + targetUserId + '-' + targetDate;
        const now = new Date().toISOString();
        const payload = {
          id: attId,
          employee_id: targetUserId,
          date: targetDate,
          status: (body.status || 'present').toLowerCase(),
          check_in: body.checkIn || body.check_in || now,
          check_out: body.checkOut || body.check_out || null,
          work_location: body.workLocation || 'Office',
          remarks: body.remarks || '',
          updated_at: now
        };
        const { data, error } = await supabase.from('attendance').upsert(payload).select().single();
        if (error) return errorResponse(error.message);
        const { data: usersList } = await supabase.from('users').select('*');
        return jsonResponse(formatAttendanceRecord(data, usersList || []));
      }
    }

    // 11.7 Cumulative Daily Operations & Workforce Report for HR & Admin
    if (path === '/api/hr/daily-cumulative-report' && method === 'GET') {
      const role = (user?.role || '').toLowerCase();
      if (role !== 'admin' && role !== 'hr' && role !== 'manager') {
        return errorResponse('Access denied. HR or Admin role required.', 403);
      }
      const targetDate = query.date || new Date().toISOString().slice(0, 10);
      const { data: usersList } = await supabase.from('users').select('*');
      const { data: attList } = await supabase.from('attendance').select('*').eq('date', targetDate);
      const { data: leavesList } = await supabase.from('leave_requests').select('*');
      const { data: tasksList } = await supabase.from('tasks').select('*');
      const { data: reportsList } = await supabase.from('daily_reports').select('*').eq('date', targetDate);

      const allUsers = usersList || [];
      const dayAtt = attList || [];
      const allLeaves = leavesList || [];
      const allTasks = tasksList || [];
      const dayReports = reportsList || [];

      let totalPresent = 0;
      let totalAbsent = 0;
      let totalOnLeave = 0;
      let totalHalfDay = 0;

      const employees = allUsers.map(u => {
        const att = dayAtt.find(a => String(a.employee_id || a.userId) === String(u.id));
        const activeLeave = allLeaves.find(l => 
          String(l.employee_id || l.userId) === String(u.id) &&
          l.status === 'approved' &&
          targetDate >= (l.from_date || l.fromDate) &&
          targetDate <= (l.to_date || l.toDate)
        );

        const leaveAppliedToday = allLeaves.filter(l => 
          String(l.employee_id || l.userId) === String(u.id) &&
          (l.created_at && l.created_at.slice(0, 10) === targetDate)
        );

        // DEFAULT: If check-in is not registered for the day, considered ABSENT!
        let status = 'absent';
        let statusLabel = 'Absent';

        if (att) {
          const s = (att.status || '').toLowerCase();
          if (s === 'present' || att.check_in || att.checkIn) {
            status = 'present';
            statusLabel = att.remarks?.includes('Attended during approved leave') ? 'Present (Leave Override)' : 'Present';
          } else if (s === 'half_day') {
            status = 'half_day';
            statusLabel = 'Half Day';
          } else if (s === 'on_leave') {
            status = 'on_leave';
            statusLabel = 'On Leave';
          } else {
            status = 'absent';
            statusLabel = 'Absent';
          }
        } else if (activeLeave) {
          status = 'on_leave';
          statusLabel = `On Leave (${activeLeave.leave_type_name || activeLeave.leaveTypeName || 'Leave'})`;
        } else {
          status = 'absent';
          statusLabel = 'Absent';
        }

        if (status === 'present') totalPresent++;
        else if (status === 'half_day') { totalHalfDay++; totalPresent++; }
        else if (status === 'on_leave') totalOnLeave++;
        else totalAbsent++;

        const tasksDone = [];
        const userReport = dayReports.find(r => String(r.employee_id || r.userId) === String(u.id));
        if (userReport) {
          if (Array.isArray(userReport.tasks_worked_on) && userReport.tasks_worked_on.length > 0) {
            tasksDone.push(...userReport.tasks_worked_on);
          } else if (Array.isArray(userReport.tasksWorkedOn) && userReport.tasksWorkedOn.length > 0) {
            tasksDone.push(...userReport.tasksWorkedOn);
          }
          if (userReport.work_completed || userReport.workCompleted) {
            tasksDone.push((userReport.work_completed || userReport.workCompleted).trim());
          }
        }

        const userTasks = allTasks.filter(t => 
          String(t.assigned_to || t.assignedTo || t.created_by || t.createdBy) === String(u.id) &&
          ((t.updated_at && t.updated_at.slice(0, 10) === targetDate) || (t.created_at && t.created_at.slice(0, 10) === targetDate))
        );
        userTasks.forEach(t => {
          const taskStr = `[${t.status === 'completed' ? 'Completed' : 'In Progress'}] ${t.title || 'Task'}`;
          if (!tasksDone.some(existing => existing.includes(t.title))) {
            tasksDone.push(taskStr);
          }
        });

        let leaveDetails = 'None';
        if (leaveAppliedToday.length > 0) {
          leaveDetails = leaveAppliedToday.map(l => 
            `Applied: ${l.leave_type_name || l.leaveTypeName || 'Leave'} (${l.from_date || l.fromDate} to ${l.to_date || l.toDate}) [${(l.status || '').toUpperCase()}]: ${l.reason || 'No reason'}`
          ).join('; ');
        } else if (activeLeave) {
          leaveDetails = `Active Leave: ${activeLeave.leave_type_name || activeLeave.leaveTypeName || 'Leave'} (${activeLeave.from_date || activeLeave.fromDate} to ${activeLeave.to_date || activeLeave.toDate}) [APPROVED]: ${activeLeave.reason || 'No reason'}`;
        }

        return {
          userId: u.id,
          name: u.name || 'Unnamed',
          email: u.email || '',
          role: u.role || 'Staff',
          department: u.department || 'IEAC Team',
          status,
          statusLabel,
          checkIn: att?.check_in || att?.checkIn || null,
          checkOut: att?.check_out || att?.checkOut || null,
          workingHours: att?.working_hours != null ? Number(att.working_hours) : (att?.workingHours != null ? Number(att.workingHours) : (status === 'present' ? 8 : 0)),
          tasksDoneToday: tasksDone.length > 0 ? tasksDone : ['No tasks logged for today'],
          leaveApplied: leaveDetails,
          remarks: att?.remarks || (status === 'absent' ? 'No check-in registered for the day' : '')
        };
      });

      return jsonResponse({
        date: targetDate,
        summary: {
          totalEmployees: allUsers.length,
          totalPresent,
          totalAbsent,
          totalOnLeave,
          totalHalfDay
        },
        employees
      });
    }

    // 11.8 Availability for date
    if (path === '/api/availability') {
      const targetDate = query.date || new Date().toISOString().split('T')[0];
      const targetObj = new Date(targetDate);
      const isSunday = targetObj.getDay() === 0;

      const { data: usersRaw } = await supabase.from('users').select('*');
      const { data: leavesRaw } = await supabase.from('leave_requests').select('*').eq('status', 'approved');
      const { data: attRaw } = await supabase.from('attendance').select('*').eq('date', targetDate);
      const { data: holRaw } = await supabase.from('holidays').select('*').eq('date', targetDate);

      const users = snakeToCamel(usersRaw || []);
      const leaves = snakeToCamel(leavesRaw || []);
      const attendance = (attRaw || []).map(a => formatAttendanceRecord(a, usersRaw || []));
      const holiday = holRaw && holRaw.length > 0 ? snakeToCamel(holRaw[0]) : null;

      const leavesOnDate = leaves.filter(lr => {
        const start = lr.startDate || lr.fromDate;
        const end = lr.endDate || lr.toDate;
        return start && end && targetDate >= start && targetDate <= end;
      });

      const onLeaveMap = new Map();
      leavesOnDate.forEach(l => onLeaveMap.set(String(l.employeeId || l.userId), l));

      const attMap = new Map();
      attendance.forEach(a => attMap.set(String(a.userId), a));

      const availableEmployees = [];
      const onLeaveEmployees = [];

      for (const u of users) {
        const leave = onLeaveMap.get(String(u.id));
        const att = attMap.get(String(u.id));
        if (leave) {
          onLeaveEmployees.push({
            userId: u.id,
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            leaveTypeName: leave.leaveTypeName || 'Approved Leave',
            reason: leave.reason,
            fromDate: leave.startDate || leave.fromDate,
            toDate: leave.endDate || leave.toDate,
            presentDespiteLeave: att?.presentDespiteLeave || false,
            leavePresentReason: att?.leavePresentReason || null
          });
          if (att?.presentDespiteLeave) {
            availableEmployees.push({
              userId: u.id,
              id: u.id,
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
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            phone: u.phone,
            status: att?.status || (isSunday ? 'sunday' : 'available')
          });
        }
      }

      return jsonResponse({
        date: targetDate,
        isSunday,
        holiday,
        total: users.length,
        availableCount: availableEmployees.length,
        onLeaveCount: onLeaveEmployees.length,
        availableEmployees,
        onLeaveEmployees,
        available: availableEmployees
      });
    }

    // 11.8 HR Stats Dashboard
    if (path === '/api/hr-stats' && method === 'GET') {
      const timeframe = query.timeframe || 'month';
      const customStart = query.startDate;
      const customEnd = query.endDate;

      const { data: usersRaw } = await supabase.from('users').select('*');
      const { data: attRaw } = await supabase.from('attendance').select('*');
      const { data: leavesRaw } = await supabase.from('leave_requests').select('*');
      const { data: tasksRaw } = await supabase.from('tasks').select('*');

      const users = snakeToCamel(usersRaw || []);
      const leaves = snakeToCamel(leavesRaw || []);
      const tasks = snakeToCamel(tasksRaw || []);
      const attendance = (attRaw || []).map(a => formatAttendanceRecord(a, usersRaw || []));

      const today = new Date().toISOString().slice(0, 10);
      const now = new Date();

      let pStart, pEnd;
      pEnd = customEnd ? new Date(customEnd) : new Date(today);
      if (customStart) {
        pStart = new Date(customStart);
      } else if (timeframe === 'day') {
        pStart = new Date(today);
      } else if (timeframe === 'week') {
        pStart = new Date(now.getTime() - 6 * 24 * 3600 * 1000);
      } else {
        pStart = new Date(now.getTime() - 29 * 24 * 3600 * 1000);
      }

      const periodDates = [];
      let dIter = new Date(pStart);
      while (dIter <= pEnd) {
        periodDates.push(dIter.toISOString().slice(0, 10));
        dIter.setDate(dIter.getDate() + 1);
      }
      const workingDaysInPeriod = Math.max(1, periodDates.filter(d => new Date(d).getDay() !== 0).length);

      const todayAtt = attendance.filter(a => a.date === today);
      const approvedLeavesToday = leaves.filter(r => r.status === 'approved' && today >= (r.startDate || r.fromDate) && today <= (r.endDate || r.toDate));
      const onLeaveUserIds = new Set(approvedLeavesToday.map(r => String(r.employeeId || r.userId)));

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
          const lr = approvedLeavesToday.find(r => String(r.employeeId || r.userId) === String(u.id));
          membersOnLeaveToday.push({
            id: u.id,
            name: u.name,
            role: u.role,
            email: u.email,
            leaveTypeName: lr?.leaveTypeName || 'Approved Leave',
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

      const employeeMetrics = users.map(u => {
        const userAtt = attendance.filter(a => String(a.userId) === String(u.id) && periodDates.includes(a.date));
        const daysPresent = userAtt.filter(a => a.status === 'present' || a.checkIn).length;
        const daysAbsent = Math.max(0, workingDaysInPeriod - daysPresent);
        const attendancePercentage = Math.min(100, Math.round((daysPresent / workingDaysInPeriod) * 1000) / 10);

        const userTasks = tasks.filter(t => String(t.assignedTo) === String(u.id));
        const completedTasks = userTasks.filter(t => t.status === 'completed').length;
        const inProgressTasks = userTasks.filter(t => t.status === 'in_progress').length;
        const taskCompletionRate = userTasks.length > 0 ? Math.round((completedTasks / userTasks.length) * 100) : 0;

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
          dailyReportsSubmitted: 0
        };
      });

      const tasksDoneDayWise = periodDates.map(dateStr => {
        const dayT = tasks.filter(t => (t.createdAt && t.createdAt.slice(0, 10) === dateStr) || (t.status === 'completed' && t.updatedAt && t.updatedAt.slice(0, 10) === dateStr));
        return {
          date: dateStr,
          tasksCount: dayT.length,
          reportsCount: 0,
          completedCount: dayT.filter(t => t.status === 'completed').length
        };
      });

      const totalPossible = users.length * workingDaysInPeriod;
      const totalActual = employeeMetrics.reduce((sum, e) => sum + e.daysPresent, 0);
      const overallAttendancePercentage = totalPossible > 0 ? Math.min(100, Math.round((totalActual / totalPossible) * 1000) / 10) : 0;

      return jsonResponse({
        totalEmployees: users.length,
        presentTodayCount: membersPresentToday.length,
        absentTodayCount: membersAbsentToday.length,
        onLeaveTodayCount: membersOnLeaveToday.length,
        membersPresentToday,
        membersAbsentToday,
        membersOnLeaveToday,
        employeeMetrics,
        tasksDoneDayWise,
        overallAttendancePercentage,
        period: {
          timeframe,
          startDate: pStart.toISOString().slice(0, 10),
          endDate: pEnd.toISOString().slice(0, 10),
          totalWorkingDays: workingDaysInPeriod
        },
        activeTasks: tasks.filter(t => t.status !== 'completed').length,
        completedTasks: tasks.filter(t => t.status === 'completed').length,
        inProgressTasks: tasks.filter(t => t.status === 'in_progress').length,
        taskCompletionRate: tasks.length > 0 ? Math.round((tasks.filter(t => t.status === 'completed').length / tasks.length) * 100) : 0
      });
    }

    // 11.9 Reports endpoints
    if (path === '/api/reports/attendance' && method === 'GET') {
      const { data: attList, error: attErr } = await supabase.from('attendance').select('*').order('date', { ascending: false });
      if (attErr) return errorResponse(attErr.message);
      const { data: usersList } = await supabase.from('users').select('*');
      return jsonResponse((attList || []).map(a => formatAttendanceRecord(a, usersList || [])));
    }

    if (path === '/api/reports/daily' && method === 'GET') {
      return jsonResponse([]);
    }

    if (path === '/api/reports/tasks' && method === 'GET') {
      const { data: tasks, error } = await supabase.from('tasks').select('*');
      if (error) return errorResponse(error.message);
      return jsonResponse(snakeToCamel(tasks || []));
    }

    if (path === '/api/reports/leaves' && method === 'GET') {
      const { data: leaves, error } = await supabase.from('leave_requests').select('*');
      if (error) return errorResponse(error.message);
      const { data: usersList } = await supabase.from('users').select('*');
      const { data: leaveTypes } = await supabase.from('leave_types').select('*');
      const enriched = (leaves || []).map(l => {
        const u = (usersList || []).find(x => String(x.id) === String(l.employee_id)) || {};
        const lt = (leaveTypes || []).find(t => String(t.id) === String(l.leave_type_id)) || {};
        return {
          ...snakeToCamel(l),
          employeeName: u.name || '',
          leaveTypeName: lt.name || 'Leave'
        };
      });
      return jsonResponse(enriched);
    }

    if (path === '/api/reports/hr-multi-sheet-excel' && method === 'GET') {
      const now = new Date();
      let endDate = query.endDate || now.toISOString().slice(0, 10);
      let startDate = query.startDate || new Date(now.getTime() - 6 * 24 * 3600 * 1000).toISOString().slice(0, 10);

      const { data: usersRaw } = await supabase.from('users').select('*');
      const { data: attRaw } = await supabase.from('attendance').select('*');
      const { data: leavesRaw } = await supabase.from('leave_requests').select('*');
      const { data: tasksRaw } = await supabase.from('tasks').select('*');

      const users = snakeToCamel(usersRaw || []);
      const attendance = (attRaw || []).map(a => formatAttendanceRecord(a, usersRaw || []));
      const leaves = snakeToCamel(leavesRaw || []);
      const tasks = snakeToCamel(tasksRaw || []);

      const blob = await generateHRMultiSheetExcel(startDate, endDate, users, attendance, leaves, tasks);
      return new Response(blob, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="IITM_IEAC_HR_Report_${startDate}_${endDate}.xlsx"`
        }
      });
    }

    if (path.startsWith('/download/')) {
      const filename = path.replace('/download/', '');

      const { data: bookings } = await supabase.from('purchase_orders').select('*');
      const { data: instruments } = await supabase.from('inventory').select('*');
      const { data: users } = await supabase.from('users').select('*');

      const mappedBookings = snakeToCamel(bookings || []);
      const mappedInstruments = snakeToCamel(instruments || []);
      const mappedUsers = snakeToCamel(users || []);

      let targetBookings = [];
      let isBulk = false;
      let isExtract = false;

      if (filename.startsWith('booking-extract-')) {
        isExtract = true;
        const match = filename.match(/booking-extract-(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})\.xlsx/);
        if (match) {
          const startDateLimit = new Date(match[1]);
          const endDateLimit = new Date(match[2] + "T23:59:59.999Z");
          targetBookings = mappedBookings.filter(b => {
            const bStart = new Date(b.startDate);
            return bStart >= startDateLimit && bStart <= endDateLimit;
          });
        } else {
          targetBookings = mappedBookings;
        }
      } else {
        targetBookings = mappedBookings.filter(b => b.sheetUrl === '/download/' + filename || b.sheetUrl === path);
        isBulk = targetBookings.length > 0 && targetBookings.some(b => b.bulkGroupId);
      }

      const blob = isExtract
        ? await generateExtractBookingExcel(targetBookings, mappedInstruments, mappedUsers)
        : await generateBookingExcel(targetBookings, mappedInstruments, mappedUsers, isBulk);

      return new Response(blob, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      });
    }

    return errorResponse('Not Found', 404);

  } catch (err) {
    console.error('Supabase Interceptor error:', err);
    return errorResponse('Internal database connection error: ' + err.message, 500);
  }
};