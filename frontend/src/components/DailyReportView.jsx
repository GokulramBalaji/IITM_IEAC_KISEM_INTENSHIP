import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import ExcelJS from "exceljs"
import {
  FileText,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  Users,
  UserCheck,
  UserX,
  AlertTriangle,
  Search,
  Filter,
  ShieldCheck,
  RefreshCw,
  Briefcase,
  Umbrella,
  Sparkles
} from "lucide-react"

function formatTime(ts) {
  if (!ts) return "—"
  try {
    const d = new Date(ts)
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }
    if (typeof ts === "string" && /^\d{2}:\d{2}/.test(ts)) {
      return ts.slice(0, 5)
    }
    return ts
  } catch (_) {
    return String(ts)
  }
}

export default function DailyReportView({ currentUser }) {
  const role = (currentUser?.role || "").toLowerCase()
  const isHR = role === "admin" || role === "hr" || role === "manager"

  const todayStr = new Date().toISOString().slice(0, 10)
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all") // all | present | od | absent | on_leave | half_day

  const [reportData, setReportData] = useState({
    date: todayStr,
    summary: {
      totalEmployees: 0,
      totalPresent: 0,
      totalOD: 0,
      totalAbsent: 0,
      totalOnLeave: 0,
      totalHalfDay: 0
    },
    employees: []
  })

  // Quick HR modal state
  const [markModalOpen, setMarkModalOpen] = useState(false)
  const [targetEmployee, setTargetEmployee] = useState(null)
  const [targetStatus, setTargetStatus] = useState("present")
  const [targetCheckIn, setTargetCheckIn] = useState("09:00")
  const [targetCheckOut, setTargetCheckOut] = useState("18:00")
  const [targetRemarks, setTargetRemarks] = useState("")
  const [submittingMark, setSubmittingMark] = useState(false)

  const loadReport = async (date = selectedDate) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/hr/daily-cumulative-report?date=${date}`)
      if (res.ok) {
        const data = await res.json()
        setReportData(data)
      } else {
        // Dynamic client-side cumulative fallback if endpoint returns 404/500
        await loadDynamicCumulativeFallback(date)
      }
    } catch (e) {
      console.warn("Server report failed, falling back to dynamic accumulation:", e)
      await loadDynamicCumulativeFallback(date)
    } finally {
      setLoading(false)
    }
  }

  // Dynamic fallback: directly accumulates users, attendance, tasks, leaves, and daily reports
  const loadDynamicCumulativeFallback = async (date) => {
    try {
      const [usersRes, attRes, tasksRes, leavesRes, drRes] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/attendance"),
        fetch("/api/tasks"),
        fetch("/api/leave-requests"),
        fetch("/api/daily-reports")
      ])

      const users = usersRes.ok ? await usersRes.json() : []
      const allAtt = attRes.ok ? await attRes.json() : []
      const allTasks = tasksRes.ok ? await tasksRes.json() : []
      const allLeaves = leavesRes.ok ? await leavesRes.json() : []
      const allReports = drRes.ok ? await drRes.json() : []

      const dayAtt = allAtt.filter(a => a.date === date)
      const dayReports = allReports.filter(r => r.date === date)

      let totalPresent = 0
      let totalOD = 0
      let totalAbsent = 0
      let totalOnLeave = 0
      let totalHalfDay = 0

      const employees = users.map(u => {
        const att = dayAtt.find(a => String(a.userId || a.employeeId) === String(u.id))
        const activeLeave = allLeaves.find(l =>
          String(l.userId || l.employee_id) === String(u.id) &&
          l.status === "approved" &&
          date >= (l.fromDate || l.from_date) &&
          date <= (l.toDate || l.to_date)
        )
        const leaveAppliedToday = allLeaves.filter(l =>
          String(l.userId || l.employee_id) === String(u.id) &&
          (l.createdAt && l.createdAt.slice(0, 10) === date)
        )

        let status = "absent"
        let statusLabel = "Absent"

        const isOdLeave = activeLeave && (
          (activeLeave.leaveTypeName || "").toLowerCase().includes("od") ||
          (activeLeave.leaveTypeName || "").toLowerCase().includes("on duty") ||
          (activeLeave.leave_type_name || "").toLowerCase().includes("od") ||
          (activeLeave.leave_type_name || "").toLowerCase().includes("on duty") ||
          (activeLeave.type || "").toLowerCase() === "od"
        )

        if (att) {
          const s = (att.status || "").toLowerCase()
          if (s === "od" || s === "on_duty" || isOdLeave) {
            status = "od"
            statusLabel = "On Duty (OD)"
          } else if (s === "present" || att.checkIn || att.check_in) {
            status = "present"
            statusLabel = att.presentDespiteLeave ? "Present (Leave Override)" : "Present"
          } else if (s === "half_day") {
            status = "half_day"
            statusLabel = "Half Day"
          } else if (s === "on_leave") {
            status = "on_leave"
            statusLabel = "On Leave"
          } else {
            status = "absent"
            statusLabel = "Absent"
          }
        } else if (isOdLeave) {
          status = "od"
          statusLabel = "On Duty (OD)"
        } else if (activeLeave) {
          status = "on_leave"
          statusLabel = `On Leave (${activeLeave.leaveTypeName || activeLeave.leave_type_name || "Leave"})`
        } else {
          status = "absent"
          statusLabel = "Absent"
        }

        if (status === "present") totalPresent++
        else if (status === "od") totalOD++
        else if (status === "half_day") { totalHalfDay++; totalPresent++ }
        else if (status === "on_leave") totalOnLeave++
        else totalAbsent++

        const tasksDone = []
        const userReport = dayReports.find(r => String(r.userId || r.employee_id) === String(u.id))
        if (userReport) {
          if (Array.isArray(userReport.tasksWorkedOn) && userReport.tasksWorkedOn.length > 0) {
            tasksDone.push(...userReport.tasksWorkedOn)
          }
          if (userReport.workCompleted && userReport.workCompleted.trim()) {
            tasksDone.push(userReport.workCompleted.trim())
          }
        }

        const userTasks = allTasks.filter(t =>
          String(t.assignedTo || t.assigned_to || t.createdBy) === String(u.id) &&
          ((t.updatedAt && t.updatedAt.slice(0, 10) === date) || (t.createdAt && t.createdAt.slice(0, 10) === date))
        )
        userTasks.forEach(t => {
          const taskStr = `[${t.status === "completed" ? "Completed" : "In Progress"}] ${t.title || "Task"}`
          if (!tasksDone.some(existing => existing.includes(t.title))) {
            tasksDone.push(taskStr)
          }
        })

        let leaveDetails = "None"
        if (leaveAppliedToday.length > 0) {
          leaveDetails = leaveAppliedToday.map(l =>
            `Applied: ${l.leaveTypeName || "Leave"} (${l.fromDate} to ${l.toDate}) [${(l.status || "").toUpperCase()}]: ${l.reason || "No reason"}`
          ).join("; ")
        } else if (activeLeave) {
          leaveDetails = `Active Leave: ${activeLeave.leaveTypeName || "Leave"} (${activeLeave.fromDate} to ${activeLeave.toDate}) [APPROVED]: ${activeLeave.reason || "No reason"}`
        }

        return {
          userId: u.id,
          name: u.name || "Staff Member",
          email: u.email || "",
          role: u.role || "Staff",
          department: u.department || "IEAC Team",
          status,
          statusLabel,
          checkIn: att?.checkIn || att?.check_in || null,
          checkOut: att?.checkOut || att?.check_out || null,
          workingHours: att?.workingHours != null ? Number(att.workingHours) : ((status === "present" || status === "od") ? 8 : 0),
          tasksDoneToday: tasksDone.length > 0 ? tasksDone : ["No tasks logged for today"],
          leaveApplied: leaveDetails,
          remarks: att?.remarks || (status === "absent" ? "No check-in registered for the day" : "")
        }
      })

      setReportData({
        date,
        summary: {
          totalEmployees: users.length,
          totalPresent,
          totalOD,
          totalAbsent,
          totalOnLeave,
          totalHalfDay
        },
        employees
      })
    } catch (err) {
      console.error("Failed to build dynamic cumulative report:", err)
    }
  }

  useEffect(() => {
    loadReport(selectedDate)
  }, [selectedDate])

  // Quick 1-click HR Mark Present for absent employee
  const quickChangeToPresent = async (employee) => {
    try {
      const res = await fetch("/api/hr/attendance/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: employee.userId || employee.id,
          employeeId: employee.userId || employee.id,
          date: selectedDate,
          status: "present",
          checkIn: `${selectedDate}T09:00:00.000Z`,
          checkOut: `${selectedDate}T18:00:00.000Z`,
          remarks: "Changed from Absent to Present by HR"
        })
      })

      if (res.ok) {
        await loadReport(selectedDate)
      } else {
        const d = await res.json()
        alert(d.error || "Failed to update attendance.")
      }
    } catch (err) {
      alert("Error: " + err.message)
    }
  }

  // Quick 1-click HR Mark OD (On Duty) for absent employee - NEVER treated as absent
  const quickChangeToOD = async (employee) => {
    try {
      const res = await fetch("/api/hr/attendance/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: employee.userId || employee.id,
          employeeId: employee.userId || employee.id,
          date: selectedDate,
          status: "od",
          checkIn: `${selectedDate}T09:00:00.000Z`,
          checkOut: `${selectedDate}T18:00:00.000Z`,
          remarks: "Marked On Duty (OD) by HR"
        })
      })

      if (res.ok) {
        await loadReport(selectedDate)
      } else {
        const d = await res.json()
        alert(d.error || "Failed to update attendance.")
      }
    } catch (err) {
      alert("Error: " + err.message)
    }
  }

  const handleOpenModal = (emp, status) => {
    setTargetEmployee(emp)
    setTargetStatus(status)
    const defaultRemark =
      status === "present" ? "Verified on duty by HR" :
      status === "od" ? "Marked On Duty (OD) by HR" :
      status === "half_day" ? "Marked half-day by HR" :
      "Marked absent by HR"
    setTargetRemarks(defaultRemark)
    setMarkModalOpen(true)
  }

  const handleModalSubmit = async (e) => {
    if (e) e.preventDefault()
    if (!targetEmployee) return
    setSubmittingMark(true)

    try {
      const isPresentOrOD = targetStatus === "present" || targetStatus === "od"
      const checkInIso = isPresentOrOD ? `${selectedDate}T${targetCheckIn}:00.000Z` : null
      const checkOutIso = isPresentOrOD ? `${selectedDate}T${targetCheckOut}:00.000Z` : null

      const res = await fetch("/api/hr/attendance/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: targetEmployee.userId || targetEmployee.id,
          employeeId: targetEmployee.userId || targetEmployee.id,
          date: selectedDate,
          status: targetStatus,
          checkIn: checkInIso,
          checkOut: checkOutIso,
          remarks: targetRemarks
        })
      })

      if (res.ok) {
        setMarkModalOpen(false)
        await loadReport(selectedDate)
      } else {
        const d = await res.json()
        alert(d.error || "Failed to update.")
      }
    } catch (err) {
      alert("Error updating record: " + err.message)
    } finally {
      setSubmittingMark(false)
    }
  }

  // Export to Excel Engine (Client-side ExcelJS with complete styling)
  const handleExportExcel = async () => {
    setExporting(true)
    try {
      const workbook = new ExcelJS.Workbook()
      workbook.creator = "IIT Madras - Industrial Energy Assessment Cell (IEAC)"
      workbook.created = new Date()

      const sheet = workbook.addWorksheet(`Daily Report ${selectedDate}`, {
        pageSetup: { orientation: "landscape", fitToWidth: 1, fitToHeight: 0 }
      })

      sheet.views = [{ showGridLines: true }]

      sheet.columns = [
        { header: "S.No", key: "sno", width: 8 },
        { header: "Employee Name", key: "name", width: 24 },
        { header: "Role / Designation", key: "role", width: 18 },
        { header: "Department", key: "department", width: 18 },
        { header: "Attendance Status", key: "status", width: 22 },
        { header: "Check-In", key: "checkIn", width: 14 },
        { header: "Check-Out", key: "checkOut", width: 14 },
        { header: "Hours", key: "hours", width: 10 },
        { header: "Tasks Done / Work Updates Today", key: "tasks", width: 45 },
        { header: "Leave Applied / Details", key: "leave", width: 35 },
        { header: "HR Remarks", key: "remarks", width: 28 }
      ]

      // Title Banner
      sheet.insertRow(1, ["IIT MADRAS — INDUSTRIAL ENERGY ASSESSMENT CELL (IEAC)"])
      sheet.mergeCells("A1:K1")
      const titleRow = sheet.getRow(1)
      titleRow.height = 32
      titleRow.getCell(1).font = { name: "Arial", size: 14, bold: true, color: { argb: "FFFFFF" } }
      titleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "0F172A" } }
      titleRow.getCell(1).alignment = { vertical: "middle", horizontal: "center" }

      // Subtitle with Date
      sheet.insertRow(2, [`DAILY WORKFORCE & OPERATIONS CUMULATIVE REPORT — ${selectedDate}`])
      sheet.mergeCells("A2:K2")
      const subRow = sheet.getRow(2)
      subRow.height = 24
      subRow.getCell(1).font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFF" } }
      subRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "1E3A8A" } }
      subRow.getCell(1).alignment = { vertical: "middle", horizontal: "center" }

      // KPI Summary Bar
      const sum = reportData.summary
      sheet.insertRow(3, [
        `Total Workforce: ${sum.totalEmployees}`,
        "",
        `Total Present: ${sum.totalPresent}`,
        "",
        `On Duty (OD): ${sum.totalOD || 0}`,
        "",
        `Total Absent: ${sum.totalAbsent}`,
        "",
        `On Leave: ${sum.totalOnLeave}`,
        "",
        `Exported: ${new Date().toLocaleTimeString()}`
      ])
      sheet.mergeCells("A3:B3")
      sheet.mergeCells("C3:D3")
      sheet.mergeCells("E3:F3")
      sheet.mergeCells("G3:H3")
      sheet.mergeCells("I3:J3")
      const kpiRow = sheet.getRow(3)
      kpiRow.height = 24
      for (let c = 1; c <= 11; c++) {
        const cell = kpiRow.getCell(c)
        cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "0F172A" } }
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F1F5F9" } }
        cell.alignment = { vertical: "middle", horizontal: "center" }
      }

      // Blank separator
      sheet.insertRow(4, [])
      sheet.getRow(4).height = 10

      // Table Header Row
      const headerRow = sheet.getRow(5)
      headerRow.height = 26
      for (let c = 1; c <= 11; c++) {
        const cell = headerRow.getCell(c)
        cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFF" } }
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "1E3A8A" } }
        cell.alignment = { vertical: "middle", horizontal: "center" }
        cell.border = {
          top: { style: "thin", color: { argb: "94A3B8" } },
          bottom: { style: "medium", color: { argb: "0F172A" } },
          left: { style: "thin", color: { argb: "94A3B8" } },
          right: { style: "thin", color: { argb: "94A3B8" } }
        }
      }

      // Populate Employee Rows
      let rIdx = 6
      reportData.employees.forEach((emp, i) => {
        const tasksFormatted = emp.tasksDoneToday.map((t, idx) => `${idx + 1}. ${t}`).join("\n")
        const checkInStr = emp.checkIn ? formatTime(emp.checkIn) : "—"
        const checkOutStr = emp.checkOut ? formatTime(emp.checkOut) : (emp.status === "present" || emp.status === "od" ? "Active" : "—")

        const row = sheet.getRow(rIdx)
        row.values = [
          i + 1,
          emp.name,
          emp.role,
          emp.department,
          emp.statusLabel,
          checkInStr,
          checkOutStr,
          emp.workingHours ? `${emp.workingHours}h` : "0h",
          tasksFormatted,
          emp.leaveApplied,
          emp.remarks
        ]

        row.alignment = { vertical: "top", wrapText: true }

        const isEven = i % 2 === 0
        const bgColor = isEven ? "FFFFFF" : "F8FAFC"

        let statusFg = "000000"
        let statusBg = bgColor
        if (emp.status === "present") {
          statusBg = "DCFCE7"
          statusFg = "166534"
        } else if (emp.status === "od") {
          statusBg = "EEF2FF"
          statusFg = "3730A3"
        } else if (emp.status === "absent") {
          statusBg = "FEE2E2"
          statusFg = "991B1B"
        } else if (emp.status === "on_leave") {
          statusBg = "DBEAFE"
          statusFg = "1E40AF"
        } else if (emp.status === "half_day") {
          statusBg = "FEF3C7"
          statusFg = "92400E"
        }

        for (let c = 1; c <= 11; c++) {
          const cell = row.getCell(c)
          cell.font = { name: "Arial", size: 9 }
          cell.border = {
            top: { style: "thin", color: { argb: "E2E8F0" } },
            bottom: { style: "thin", color: { argb: "E2E8F0" } },
            left: { style: "thin", color: { argb: "E2E8F0" } },
            right: { style: "thin", color: { argb: "E2E8F0" } }
          }

          if (c === 5) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: statusBg } }
            cell.font = { name: "Arial", size: 9, bold: true, color: { argb: statusFg } }
            cell.alignment = { vertical: "middle", horizontal: "center" }
          } else if (c === 1 || c === 6 || c === 7 || c === 8) {
            cell.alignment = { vertical: "middle", horizontal: "center" }
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } }
          } else {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } }
          }
        }

        rIdx++
      })

      // Generate buffer and trigger browser download
      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
      const url = window.URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `IITM_IEAC_Daily_Cumulative_Report_${selectedDate}.xlsx`
      document.body.appendChild(anchor)
      anchor.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(anchor)
    } catch (err) {
      console.error("Export error:", err)
      alert("Failed to export Excel report: " + err.message)
    } finally {
      setExporting(false)
    }
  }

  // Filtered employees list
  const filteredEmployees = (reportData.employees || []).filter(emp => {
    const q = searchQuery.toLowerCase()
    const matchesSearch =
      (emp.name || "").toLowerCase().includes(q) ||
      (emp.email || "").toLowerCase().includes(q) ||
      (emp.role || "").toLowerCase().includes(q) ||
      (emp.tasksDoneToday || []).some(t => t.toLowerCase().includes(q))

    if (!matchesSearch) return false

    if (statusFilter === "present") return emp.status === "present"
    if (statusFilter === "od") return emp.status === "od"
    if (statusFilter === "absent") return emp.status === "absent"
    if (statusFilter === "on_leave") return emp.status === "on_leave"
    if (statusFilter === "half_day") return emp.status === "half_day"
    return true
  })

  if (!isHR) {
    return (
      <div className="flex items-center justify-center p-12">
        <Card className="max-w-md w-full text-center p-6 border-red-200 bg-red-50/30">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-foreground">Access Restricted</h2>
          <p className="text-sm text-muted-foreground mt-1">
            The Cumulative Daily Reports portal is reserved for HR and Administration managers only.
          </p>
        </Card>
      </div>
    )
  }

  const sum = reportData.summary || {
    totalEmployees: 0,
    totalPresent: 0,
    totalOD: 0,
    totalAbsent: 0,
    totalOnLeave: 0,
    totalHalfDay: 0
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Daily Workforce Cumulative Report</h1>
            <Badge className="bg-primary/10 text-primary border-primary/20 text-xs gap-1 font-semibold">
              <ShieldCheck className="w-3 h-3" /> HR & Admin Audit
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Comprehensive daily breakdown of employee attendance, clock-in/out times, tasks completed, and leave status
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 border rounded-lg p-1 bg-background shadow-xs">
            <Calendar className="w-4 h-4 text-muted-foreground ml-1.5" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="h-8 text-xs w-36 border-0 focus-visible:ring-0"
            />
            {selectedDate !== todayStr && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedDate(todayStr)}
                className="h-7 text-xs px-2 text-primary font-medium"
              >
                Today
              </Button>
            )}
          </div>

          <Button
            onClick={() => loadReport(selectedDate)}
            variant="outline"
            size="sm"
            className="h-10 text-xs gap-1.5"
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            onClick={handleExportExcel}
            size="sm"
            className="h-10 text-xs gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm"
            disabled={exporting || loading}
          >
            <Download className="w-4 h-4" />
            {exporting ? "Generating Sheet..." : "Export to Excel (.xlsx)"}
          </Button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="border bg-card shadow-xs">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium text-muted-foreground">Total Workforce</p>
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <p className="text-2xl font-extrabold mt-1 text-foreground">{sum.totalEmployees}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Active team members</p>
          </CardContent>
        </Card>

        <Card className="border border-green-200 bg-green-50/50 shadow-xs">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-green-700">Present Today</p>
              <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
            </div>
            <p className="text-2xl font-extrabold mt-1 text-green-800">{sum.totalPresent}</p>
            <p className="text-[10px] text-green-600 mt-0.5">
              {Math.round(((sum.totalPresent || 0) / (sum.totalEmployees || 1)) * 100)}% present rate
            </p>
          </CardContent>
        </Card>

        <Card className="border border-indigo-200 bg-indigo-50/50 shadow-xs">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-indigo-700">On Duty (OD)</p>
              <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            <p className="text-2xl font-extrabold mt-1 text-indigo-800">{sum.totalOD || 0}</p>
            <p className="text-[10px] text-indigo-600 mt-0.5">Active (not absent)</p>
          </CardContent>
        </Card>

        <Card className="border border-red-200 bg-red-50/50 shadow-xs">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-red-700">Absent Today</p>
              <XCircle className="w-3.5 h-3.5 text-red-600" />
            </div>
            <p className="text-2xl font-extrabold mt-1 text-red-800">{sum.totalAbsent}</p>
            <p className="text-[10px] text-red-600 mt-0.5">No check-in registered</p>
          </CardContent>
        </Card>

        <Card className="border border-blue-200 bg-blue-50/50 shadow-xs">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-blue-700">Leave / Half-Day</p>
              <Umbrella className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <p className="text-2xl font-extrabold mt-1 text-blue-800">{sum.totalOnLeave + sum.totalHalfDay}</p>
            <p className="text-[10px] text-blue-600 mt-0.5">
              {sum.totalOnLeave} leave · {sum.totalHalfDay} half-day
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Cumulative Table Card */}
      <Card className="border-2 border-primary/10 shadow-xs">
        <CardHeader className="pb-3 border-b bg-muted/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Workforce Daily Operations Breakdown
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Target Date: <strong>{new Date(selectedDate).toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</strong>
              </CardDescription>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  placeholder="Filter name, email, tasks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 text-xs pl-8 w-56"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 text-xs rounded-md border bg-background px-2.5 focus:outline-none"
              >
                <option value="all">All Statuses ({sum.totalEmployees})</option>
                <option value="present">Present Only ({sum.totalPresent})</option>
                <option value="od">On Duty OD ({sum.totalOD || 0})</option>
                <option value="absent">Absent Only ({sum.totalAbsent})</option>
                <option value="on_leave">On Leave Only ({sum.totalOnLeave})</option>
                <option value="half_day">Half Day ({sum.totalHalfDay})</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="text-center py-16 px-4">
              <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm font-semibold text-foreground">No records match the current filter</p>
              <p className="text-xs text-muted-foreground mt-1">Try clearing your search query or selecting a different status filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground bg-muted/20">
                    <th className="text-left py-3 px-4 font-semibold w-12">#</th>
                    <th className="text-left py-3 px-4 font-semibold min-w-[200px]">Employee</th>
                    <th className="text-left py-3 px-4 font-semibold min-w-[140px]">Attendance Status</th>
                    <th className="text-left py-3 px-4 font-semibold min-w-[170px]">Check-In / Out</th>
                    <th className="text-left py-3 px-4 font-semibold min-w-[260px]">Tasks Done Today</th>
                    <th className="text-left py-3 px-4 font-semibold min-w-[200px]">Leave Applied / Status</th>
                    <th className="text-right py-3 px-4 font-semibold min-w-[180px]">HR Attendance Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredEmployees.map((emp, index) => {
                    const isPresent = emp.status === "present"
                    const isOD = emp.status === "od"
                    const isAbsent = emp.status === "absent"
                    const isOnLeave = emp.status === "on_leave"
                    const isHalfDay = emp.status === "half_day"

                    return (
                      <tr key={emp.userId || index} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 text-xs text-muted-foreground font-mono">
                          {index + 1}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                              {(emp.name || "?").charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-foreground text-xs">{emp.name}</p>
                              <p className="text-[10px] text-muted-foreground">{emp.email}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <Badge variant="outline" className="text-[9px] h-4 px-1 capitalize">
                                   {emp.role}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground/70">· {emp.department}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
                            isPresent ? "bg-green-50 text-green-700 border-green-200" :
                            isOD ? "bg-indigo-50 text-indigo-700 border-indigo-200 font-bold" :
                            isHalfDay ? "bg-amber-50 text-amber-700 border-amber-200" :
                            isOnLeave ? "bg-blue-50 text-blue-700 border-blue-200" :
                            "bg-red-50 text-red-700 border-red-200 font-bold"
                          }`}>
                            {isPresent ? <UserCheck className="w-3 h-3 mr-1 text-green-600" /> :
                             isOD ? <Briefcase className="w-3 h-3 mr-1 text-indigo-600" /> :
                             isOnLeave ? <Umbrella className="w-3 h-3 mr-1 text-blue-600" /> :
                             isHalfDay ? <Clock className="w-3 h-3 mr-1 text-amber-600" /> :
                             <UserX className="w-3 h-3 mr-1 text-red-600" />}
                            {emp.statusLabel}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="space-y-0.5">
                            <p className="text-xs font-mono text-foreground font-medium">
                              In: <span className="text-emerald-700 font-semibold">{formatTime(emp.checkIn)}</span>
                              {" · "}
                              Out: <span className="text-muted-foreground">{formatTime(emp.checkOut)}</span>
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              Duration: <strong className="text-foreground">{emp.workingHours ? `${emp.workingHours} hrs` : (isPresent || isOD ? "Active Clock-In" : "0 hrs")}</strong>
                            </p>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="space-y-1 max-w-[340px]">
                            {emp.tasksDoneToday.map((t, tIdx) => (
                              <div key={tIdx} className="text-xs flex items-start gap-1.5 leading-relaxed">
                                <span className="text-primary font-bold shrink-0">•</span>
                                <span className="text-foreground/90 text-[11px]">{t}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs">
                          {emp.leaveApplied && emp.leaveApplied !== "None" ? (
                            <div className="bg-blue-50/70 border border-blue-200 rounded-md p-2 text-[11px] text-blue-900 leading-snug">
                              {emp.leaveApplied}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">None</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {isAbsent ? (
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              <Button
                                size="sm"
                                onClick={() => quickChangeToPresent(emp)}
                                className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white font-medium shadow-xs"
                              >
                                <UserCheck className="w-3 h-3 mr-1" /> Present
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => quickChangeToOD(emp)}
                                className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-xs"
                                title="Mark On Duty (OD) - Active workforce, not absent"
                              >
                                <Briefcase className="w-3 h-3 mr-1" /> OD
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenModal(emp, "present")}
                                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                              >
                                Edit
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenModal(emp, emp.status || "present")}
                                className="h-7 text-xs border-primary/30 text-primary hover:bg-primary/5 font-medium"
                              >
                                Edit Attendance
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenModal(emp, "absent")}
                                className="h-7 text-xs border-red-200 text-red-700 hover:bg-red-50"
                              >
                                <UserX className="w-3 h-3 mr-1" /> Mark Absent
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* HR Manual Override Modal */}
      <Dialog open={markModalOpen} onOpenChange={setMarkModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              Override Attendance Status
            </DialogTitle>
            <DialogDescription className="text-xs">
              Updating record for <strong>{targetEmployee?.name}</strong> on <strong>{selectedDate}</strong>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleModalSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Attendance Status</label>
              <select
                value={targetStatus}
                onChange={(e) => {
                  const val = e.target.value
                  setTargetStatus(val)
                  if (val === "od") setTargetRemarks("Marked On Duty (OD) by HR")
                  else if (val === "present") setTargetRemarks("Verified on duty by HR")
                  else if (val === "half_day") setTargetRemarks("Marked half-day by HR")
                  else if (val === "absent") setTargetRemarks("Marked absent by HR")
                }}
                className="w-full text-xs rounded-lg border bg-background p-2 focus:ring-2 focus:ring-primary/20"
              >
                <option value="present">Present (Full Day - 8h)</option>
                <option value="od">On Duty (OD — Active Workforce, Not Absent)</option>
                <option value="half_day">Half Day (4 Hours)</option>
                <option value="absent">Absent</option>
                <option value="on_leave">On Leave</option>
              </select>
            </div>

            {(targetStatus === "present" || targetStatus === "od") && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground font-medium">Check-In Time</label>
                  <Input
                    type="time"
                    value={targetCheckIn}
                    onChange={(e) => setTargetCheckIn(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground font-medium">Check-Out Time</label>
                  <Input
                    type="time"
                    value={targetCheckOut}
                    onChange={(e) => setTargetCheckOut(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold">HR Verification Note / Reason</label>
              <Input
                type="text"
                placeholder="e.g. Approved site visit / audit"
                value={targetRemarks}
                onChange={(e) => setTargetRemarks(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMarkModalOpen(false)}
                disabled={submittingMark}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-primary text-primary-foreground font-semibold"
                disabled={submittingMark}
              >
                {submittingMark ? "Saving..." : "Save Attendance"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
