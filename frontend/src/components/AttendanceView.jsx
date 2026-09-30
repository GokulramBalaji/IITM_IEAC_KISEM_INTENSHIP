import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Clock, LogIn, LogOut, CheckCircle2, Activity, Calendar, Users, UserCheck, UserX, AlertTriangle, ShieldCheck } from "lucide-react"

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

function formatDate(d) {
  if (!d) return "—"
  try {
    return new Date(d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })
  } catch (_) {
    return String(d)
  }
}

function getLocalDateString(d = new Date()) {
  const dt = (d instanceof Date && !isNaN(d.getTime())) ? d : new Date(d);
  if (isNaN(dt.getTime())) return new Date().toISOString().slice(0, 10);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function AttendanceView({ currentUser }) {
  const role = (currentUser?.role || "").toLowerCase()
  const isHR = role === "admin" || role === "hr" || role === "manager"

  const [activeTab, setActiveTab] = useState("self") // "self" | "hr_management"

  // Self Attendance States
  const [today, setToday] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [tick, setTick] = useState(new Date())
  const lastDateRef = React.useRef(getLocalDateString())

  // HR Workforce Management States
  const [allUsers, setAllUsers] = useState([])
  const [allAttendance, setAllAttendance] = useState([])
  const [selectedManageDate, setSelectedManageDate] = useState(getLocalDateString())
  const [searchEmployee, setSearchEmployee] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  // HR Manual Mark Modal State
  const [markModalOpen, setMarkModalOpen] = useState(false)
  const [targetEmployee, setTargetEmployee] = useState(null)
  const [targetStatus, setTargetStatus] = useState("present")
  const [targetRemarks, setTargetRemarks] = useState("")
  const [targetCheckIn, setTargetCheckIn] = useState("09:00")
  const [targetCheckOut, setTargetCheckOut] = useState("18:00")
  const [submittingMark, setSubmittingMark] = useState(false)

  // Live clock and midnight (00:00) rollover detection
  useEffect(() => {
    const iv = setInterval(() => {
      const now = new Date()
      setTick(now)
      const currentDay = getLocalDateString(now)
      if (lastDateRef.current && currentDay !== lastDateRef.current) {
        // Date changed (midnight 00:00 rollover)!
        lastDateRef.current = currentDay
        setSelectedManageDate(currentDay)
        loadSelf()
        if (isHR) loadHRData()
      }
    }, 1000)
    return () => clearInterval(iv)
  }, [isHR])

  const loadSelf = async () => {
    setLoading(true)
    try {
      const [tr, hr] = await Promise.all([fetch("/api/attendance/today"), fetch("/api/attendance")])
      if (tr.ok) {
        const t = await tr.json()
        const currentTodayStr = getLocalDateString()
        if (t && t.date === currentTodayStr) {
          setToday(t)
        } else {
          setToday(null)
        }
      } else {
        setToday(null)
      }
      if (hr.ok) {
        const all = await hr.json()
        const mine = (Array.isArray(all) ? all : [])
          .filter(a => String(a.userId || a.employeeId) === String(currentUser?.id))
          .sort((a, b) => new Date(b.date) - new Date(a.date))
        setHistory(mine.slice(0, 30))
      }
    } catch (e) {
      console.error("loadSelf error:", e)
    } finally {
      setLoading(false)
    }
  }

  const loadHRData = async () => {
    if (!isHR) return
    try {
      const [ur, ar] = await Promise.all([fetch("/api/users"), fetch("/api/attendance")])
      if (ur.ok) {
        const u = await ur.json()
        setAllUsers(Array.isArray(u) ? u : [])
      }
      if (ar.ok) {
        const a = await ar.json()
        setAllAttendance(Array.isArray(a) ? a : [])
      }
    } catch (e) {
      console.error("loadHRData error:", e)
    }
  }

  useEffect(() => {
    loadSelf()
    if (isHR) loadHRData()
  }, [])

  const checkIn = async () => {
    setActing(true)
    try {
      const res = await fetch("/api/attendance/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: getLocalDateString() })
      })
      if (res.ok) {
        await loadSelf()
        if (isHR) await loadHRData()
      } else {
        const d = await res.json()
        alert(d.error || "Failed to check in.")
      }
    } catch (e) {
      alert("Error checking in: " + e.message)
    } finally {
      setActing(false)
    }
  }

  const checkOut = async () => {
    setActing(true)
    try {
      const token = localStorage.getItem("token") || sessionStorage.getItem("token")
      const headers = { "Content-Type": "application/json" }
      if (token) headers["Authorization"] = `Bearer ${token}`

      const res = await fetch("/api/attendance/checkout", {
        method: "POST",
        headers,
        body: JSON.stringify({ date: getLocalDateString() })
      })
      if (res.ok) {
        await loadSelf()
        if (isHR) await loadHRData()
      } else {
        const d = await res.json()
        alert(d.error || "Failed to check out.")
      }
    } catch (e) {
      alert("Error checking out: " + e.message)
    } finally {
      setActing(false)
    }
  }

  // Quick 1-click HR Mark Present for absent employee
  const quickMarkPresent = async (employee) => {
    try {
      const res = await fetch("/api/hr/attendance/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: employee.id,
          employeeId: employee.id,
          date: selectedManageDate,
          status: "present",
          checkIn: `${selectedManageDate}T09:00:00.000Z`,
          checkOut: `${selectedManageDate}T18:00:00.000Z`,
          remarks: "Changed from Absent to Present by HR"
        })
      })
      if (res.ok) {
        await loadHRData()
        await loadSelf()
      } else {
        const d = await res.json()
        alert(d.error || "Failed to mark present.")
      }
    } catch (err) {
      alert("Error marking present: " + err.message)
    }
  }

  // Quick 1-click HR Mark OD (On Duty) - NOT treated as absent
  const quickMarkOD = async (employee) => {
    try {
      const res = await fetch("/api/hr/attendance/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: employee.id,
          employeeId: employee.id,
          date: selectedManageDate,
          status: "od",
          checkIn: `${selectedManageDate}T09:00:00.000Z`,
          checkOut: `${selectedManageDate}T18:00:00.000Z`,
          remarks: "Marked On Duty (OD) by HR"
        })
      })
      if (res.ok) {
        await loadHRData()
        await loadSelf()
      } else {
        const d = await res.json()
        alert(d.error || "Failed to mark OD.")
      }
    } catch (err) {
      alert("Error marking OD: " + err.message)
    }
  }

  // Open HR Mark Modal
  const openMarkModal = (user, status) => {
    setTargetEmployee(user)
    setTargetStatus(status)
    const defaultRemark = status === "present" ? "Verified on duty by HR"
      : (status === "od" ? "Assigned On Duty (OD) by HR"
      : (status === "half_day" ? "Marked half-day by HR" : "Marked absent by HR"))
    setTargetRemarks(defaultRemark)
    setMarkModalOpen(true)
  }

  const handleHRSubmitMark = async (e) => {
    if (e) e.preventDefault()
    if (!targetEmployee) return
    setSubmittingMark(true)

    try {
      const isPresentOrOD = targetStatus === "present" || targetStatus === "od"
      const checkInIso = isPresentOrOD ? `${selectedManageDate}T${targetCheckIn}:00.000Z` : null
      const checkOutIso = isPresentOrOD ? `${selectedManageDate}T${targetCheckOut}:00.000Z` : null

      const res = await fetch("/api/hr/attendance/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: targetEmployee.id,
          employeeId: targetEmployee.id,
          date: selectedManageDate,
          status: targetStatus,
          checkIn: checkInIso,
          checkOut: checkOutIso,
          remarks: targetRemarks
        })
      })

      if (res.ok) {
        setMarkModalOpen(false)
        await loadHRData()
        await loadSelf()
      } else {
        const d = await res.json()
        alert(d.error || "Failed to update attendance.")
      }
    } catch (err) {
      console.error("Manual mark failed", err)
      alert("Error updating attendance: " + err.message)
    } finally {
      setSubmittingMark(false)
    }
  }

  const todayStr = getLocalDateString(tick)
  const isTodayRecord = today && today.date === todayStr
  const currentToday = isTodayRecord ? today : null

  const elapsedHours = currentToday?.checkIn && !currentToday?.checkOut
    ? ((tick.getTime() - new Date(currentToday.checkIn).getTime()) / 3600000).toFixed(2)
    : null

  const weekHistory = history.slice(0, 5)
  const totalHoursThisWeek = weekHistory.reduce((s, a) => s + (Number(a.workingHours) || 0), 0).toFixed(1)
  const avgHours = weekHistory.length > 0 ? (totalHoursThisWeek / weekHistory.length).toFixed(1) : 0

  // HR Workforce KPI stats for selected date
  // RULE: OD is NOT treated as absent!
  const hrMetrics = {
    total: allUsers.length,
    present: allUsers.filter(u => {
      const a = allAttendance.find(x => String(x.userId || x.employeeId) === String(u.id) && x.date === selectedManageDate)
      return (a?.status === "present" || (a?.checkIn && a?.status !== "od"))
    }).length,
    od: allUsers.filter(u => {
      const a = allAttendance.find(x => String(x.userId || x.employeeId) === String(u.id) && x.date === selectedManageDate)
      return a?.status === "od" || a?.status === "on_duty"
    }).length,
    absent: allUsers.filter(u => {
      const a = allAttendance.find(x => String(x.userId || x.employeeId) === String(u.id) && x.date === selectedManageDate)
      const isPresent = a?.status === "present" || (a?.checkIn && a?.status !== "od")
      const isOD = a?.status === "od" || a?.status === "on_duty"
      const isHalfDay = a?.status === "half_day"
      const isOnLeave = a?.status === "on_leave"
      return !isPresent && !isOD && !isHalfDay && !isOnLeave
    }).length,
    halfDay: allUsers.filter(u => {
      const a = allAttendance.find(x => String(x.userId || x.employeeId) === String(u.id) && x.date === selectedManageDate)
      return a?.status === "half_day"
    }).length,
    onLeave: allUsers.filter(u => {
      const a = allAttendance.find(x => String(x.userId || x.employeeId) === String(u.id) && x.date === selectedManageDate)
      return a?.status === "on_leave"
    }).length
  }

  // HR Workforce filtered list for the selected date
  // RULE: On Duty (OD) is active workforce, NOT absent!
  // If check-in is not registered and not on OD/leave, considered ABSENT.
  const filteredHRList = allUsers.filter(u => {
    const matchSearch = (u.name || "").toLowerCase().includes(searchEmployee.toLowerCase()) ||
                        (u.email || "").toLowerCase().includes(searchEmployee.toLowerCase())
    if (!matchSearch) return false

    const att = allAttendance.find(a => (String(a.userId || a.employeeId) === String(u.id)) && a.date === selectedManageDate)
    const isPresent = att?.status === "present" || (att?.checkIn && att?.status !== "od")
    const isOD = att?.status === "od" || att?.status === "on_duty"
    const isHalfDay = att?.status === "half_day"
    const isOnLeave = att?.status === "on_leave"
    const isAbsent = !isPresent && !isOD && !isHalfDay && !isOnLeave

    if (statusFilter === "present") return isPresent
    if (statusFilter === "od") return isOD
    if (statusFilter === "absent") return isAbsent
    if (statusFilter === "half_day") return isHalfDay
    if (statusFilter === "on_leave") return isOnLeave
    return true
  })

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Workforce Attendance</h1>
          <p className="text-sm text-muted-foreground">Clock-in, tracking, and workforce attendance management</p>
        </div>

        {isHR && (
          <div className="flex border rounded-lg p-1 bg-muted/30 self-start sm:self-auto">
            <button
              onClick={() => setActiveTab("self")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                activeTab === "self" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              My Attendance
            </button>
            <button
              onClick={() => setActiveTab("hr_management")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all ${
                activeTab === "hr_management" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              HR Attendance Control
            </button>
          </div>
        )}
      </div>

      {activeTab === "self" ? (
        <>
          {/* Live clock card */}
          <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="text-center sm:text-left">
                  <p className="text-4xl font-mono font-bold tracking-tight text-foreground">
                    {tick.toLocaleTimeString()}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">{tick.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
                </div>
                <div className="flex flex-col items-center gap-4">
                  {currentToday?.checkIn && (
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase">Check In</p>
                        <p className="text-lg font-bold text-green-600">{formatTime(currentToday.checkIn)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase">Duration</p>
                        <p className="text-lg font-bold text-primary">{elapsedHours ? `${elapsedHours}h` : `${currentToday.workingHours}h`}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase">Check Out</p>
                        <p className="text-lg font-bold text-muted-foreground">{formatTime(currentToday.checkOut)}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-3">
                    {!currentToday?.checkIn ? (
                      <Button onClick={checkIn} disabled={acting} size="lg" className="gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold">
                        <LogIn className="w-4 h-4" />Check In
                      </Button>
                    ) : !currentToday?.checkOut ? (
                      <Button onClick={checkOut} disabled={acting} size="lg" variant="outline" className="gap-2 border-red-500 text-red-600 hover:bg-red-50 font-semibold">
                        <LogOut className="w-4 h-4" />Check Out
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2 text-green-600 font-semibold text-sm">
                        <CheckCircle2 className="w-5 h-5" />Day Completed ({currentToday.workingHours} hrs)
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "This Week Total", value: `${totalHoursThisWeek}h`, sub: "Logged hours" },
              { label: "Daily Average", value: `${avgHours}h`, sub: "Last 5 workdays" },
              { label: "Status Today", value: currentToday?.checkIn ? (currentToday.checkOut ? "Completed" : "Checked In") : "Not Checked In", sub: todayStr },
              { label: "Attendance Rate", value: `${Math.min(100, Math.round((weekHistory.filter(h => (h.status || '').toLowerCase() === 'present').length / 5) * 100))}%`, sub: "Last 5 days" }
            ].map(({ label, value, sub }) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                  <p className="text-2xl font-bold mt-1 text-foreground">{value}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Attendance History */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recent Attendance History (Last 30 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}</div>
              ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No attendance records found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left py-2 font-medium">Date</th>
                        <th className="text-left py-2 font-medium">Status</th>
                        <th className="text-left py-2 font-medium">Check In</th>
                        <th className="text-left py-2 font-medium">Check Out</th>
                        <th className="text-left py-2 font-medium">Working Hours</th>
                        <th className="text-left py-2 font-medium">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {history.map(a => {
                        const s = (a.status || '').toLowerCase()
                        return (
                          <tr key={a.id || a.date} className="hover:bg-muted/40 transition-colors">
                            <td className="py-2.5 font-medium">{formatDate(a.date)}</td>
                            <td className="py-2.5">
                              <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                s === "present" ? "bg-green-100 text-green-700" :
                                s === "half_day" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"
                              }`}>
                                {a.presentDespiteLeave ? "Present (Leave Override)" : (a.status || "present")}
                              </span>
                            </td>
                            <td className="py-2.5 text-muted-foreground font-mono">{formatTime(a.checkIn)}</td>
                            <td className="py-2.5 text-muted-foreground font-mono">{formatTime(a.checkOut)}</td>
                            <td className="py-2.5 font-semibold text-foreground">{a.workingHours ? `${a.workingHours}h` : "—"}</td>
                            <td className="py-2.5 text-xs text-muted-foreground">{a.leavePresentReason ? `Attended despite leave: ${a.leavePresentReason}` : (a.remarks || "—")}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        /* HR WORKFORCE ATTENDANCE CONTROL PANEL */
        <div className="space-y-4">
          {/* HR Workforce Summary KPI Stats for Date */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Card className="border bg-card">
              <CardContent className="p-3">
                <p className="text-[11px] font-medium text-muted-foreground">Total Workforce</p>
                <p className="text-xl font-bold mt-0.5 text-foreground">{hrMetrics.total}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Registered staff</p>
              </CardContent>
            </Card>
            <Card className="border border-green-200 bg-green-50/40">
              <CardContent className="p-3">
                <p className="text-[11px] font-semibold text-green-700">Present Today</p>
                <p className="text-xl font-bold mt-0.5 text-green-800">{hrMetrics.present}</p>
                <p className="text-[10px] text-green-600 mt-0.5">Checked In / Override</p>
              </CardContent>
            </Card>
            <Card className="border border-indigo-200 bg-indigo-50/40">
              <CardContent className="p-3">
                <p className="text-[11px] font-semibold text-indigo-700">On Duty (OD)</p>
                <p className="text-xl font-bold mt-0.5 text-indigo-800">{hrMetrics.od}</p>
                <p className="text-[10px] text-indigo-600 mt-0.5">Field / Client Site</p>
              </CardContent>
            </Card>
            <Card className="border border-red-200 bg-red-50/40">
              <CardContent className="p-3">
                <p className="text-[11px] font-semibold text-red-700">Total Absent Today</p>
                <p className="text-xl font-bold mt-0.5 text-red-800">{hrMetrics.absent}</p>
                <p className="text-[10px] text-red-600 mt-0.5">No check-in registered</p>
              </CardContent>
            </Card>
            <Card className="border border-blue-200 bg-blue-50/40">
              <CardContent className="p-3">
                <p className="text-[11px] font-semibold text-blue-700">On Leave / Half-Day</p>
                <p className="text-xl font-bold mt-0.5 text-blue-800">{hrMetrics.onLeave + hrMetrics.halfDay}</p>
                <p className="text-[10px] text-blue-600 mt-0.5">{hrMetrics.onLeave} leave · {hrMetrics.halfDay} half-day</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-2 border-primary/20">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    Workforce Attendance Management
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Employees without check-in are considered Absent. On Duty (OD) is active workforce. HR can change attendance anytime.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground font-medium">Date:</span>
                    <Input
                      type="date"
                      value={selectedManageDate}
                      onChange={(e) => setSelectedManageDate(e.target.value)}
                      className="h-8 text-xs w-36"
                    />
                  </div>
                  <Input
                    placeholder="Search employee..."
                    value={searchEmployee}
                    onChange={(e) => setSearchEmployee(e.target.value)}
                    className="h-8 text-xs w-44"
                  />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-8 text-xs rounded-md border bg-background px-2"
                  >
                    <option value="all">All Statuses ({allUsers.length})</option>
                    <option value="present">Present ({hrMetrics.present})</option>
                    <option value="od">On Duty OD ({hrMetrics.od})</option>
                    <option value="absent">Absent ({hrMetrics.absent})</option>
                    <option value="half_day">Half Day ({hrMetrics.halfDay})</option>
                    <option value="on_leave">On Leave ({hrMetrics.onLeave})</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground bg-muted/20">
                      <th className="text-left py-2.5 px-3 font-semibold">Employee</th>
                      <th className="text-left py-2.5 px-3 font-semibold">Role</th>
                      <th className="text-left py-2.5 px-3 font-semibold">Status ({selectedManageDate})</th>
                      <th className="text-left py-2.5 px-3 font-semibold">Logged Hours</th>
                      <th className="text-left py-2.5 px-3 font-semibold">HR Remarks</th>
                      <th className="text-right py-2.5 px-3 font-semibold">HR Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredHRList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                          No employees match the current filter.
                        </td>
                      </tr>
                    ) : (
                      filteredHRList.map(u => {
                        const att = allAttendance.find(a => (String(a.userId || a.employeeId) === String(u.id)) && a.date === selectedManageDate)
                        const hasCheckIn = !!att?.checkIn
                        const normStatus = (att?.status || '').toLowerCase()
                        const isOD = normStatus === "od" || normStatus === "on_duty"
                        const isPresent = !isOD && (hasCheckIn || normStatus === "present")
                        const isHalfDay = normStatus === "half_day"
                        const isOnLeave = normStatus === "on_leave"
                        const isAbsent = !isPresent && !isOD && !isHalfDay && !isOnLeave

                        return (
                          <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-3 px-3">
                              <p className="font-semibold text-foreground text-xs">{u.name}</p>
                              <p className="text-[10px] text-muted-foreground">{u.email}</p>
                            </td>
                            <td className="py-3 px-3">
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {u.role || "Staff"}
                              </Badge>
                            </td>
                            <td className="py-3 px-3">
                              <span className={`inline-flex items-center text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${
                                isOD ? "bg-indigo-50 text-indigo-700 border-indigo-200" :
                                isPresent ? "bg-green-50 text-green-700 border-green-200" :
                                isHalfDay ? "bg-amber-50 text-amber-700 border-amber-200" :
                                isOnLeave ? "bg-blue-50 text-blue-700 border-blue-200" :
                                "bg-red-50 text-red-700 border-red-200 font-bold"
                              }`}>
                                {isOD ? "On Duty (OD)" :
                                 att?.presentDespiteLeave ? "Present (Leave Override)" :
                                 isPresent ? (hasCheckIn ? "Present (Checked In)" : "Present (HR Override)") :
                                 isHalfDay ? "Half Day" :
                                 isOnLeave ? "On Leave" :
                                 "Absent (No Check-In)"}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-xs font-mono">
                              {isOD ? "8.0h (OD)" : att?.checkIn ? `${formatTime(att.checkIn)} → ${att.checkOut ? formatTime(att.checkOut) : "Active"}` : "—"}
                            </td>
                            <td className="py-3 px-3 text-xs text-muted-foreground max-w-[180px] truncate">
                              {att?.leavePresentReason ? `Attended despite leave: ${att.leavePresentReason}` : (att?.remarks || (isAbsent ? "No check-in registered" : (isOD ? "On Duty" : "—")))}
                            </td>
                            <td className="py-3 px-3 text-right">
                              {isAbsent ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    size="sm"
                                    onClick={() => quickMarkPresent(u)}
                                    className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white font-medium"
                                  >
                                    <UserCheck className="w-3.5 h-3.5 mr-1" /> Change to Present
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => quickMarkOD(u)}
                                    className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                                  >
                                    Mark OD
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openMarkModal(u, "present")}
                                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                                  >
                                    Edit
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openMarkModal(u, normStatus || "present")}
                                    className="h-7 text-xs border-primary/30 text-primary hover:bg-primary/5"
                                  >
                                    Edit Attendance
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openMarkModal(u, "absent")}
                                    className="h-7 text-xs border-red-200 text-red-700 hover:bg-red-50"
                                  >
                                    <UserX className="w-3.5 h-3.5 mr-1" /> Mark Absent
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* HR Manual Attendance Dialog Modal */}
      <Dialog open={markModalOpen} onOpenChange={setMarkModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              HR Attendance Control ({targetStatus.toUpperCase()})
            </DialogTitle>
            <DialogDescription className="text-xs">
              Updating attendance record for <strong>{targetEmployee?.name}</strong> on <strong>{selectedManageDate}</strong>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleHRSubmitMark} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Attendance Status</label>
              <select
                value={targetStatus}
                onChange={(e) => {
                  const newStatus = e.target.value
                  setTargetStatus(newStatus)
                  if (newStatus === "od") setTargetRemarks("Marked On Duty (OD) by HR")
                  else if (newStatus === "present") setTargetRemarks("Verified on duty by HR")
                  else if (newStatus === "half_day") setTargetRemarks("Marked half-day by HR")
                  else if (newStatus === "absent") setTargetRemarks("Marked absent by HR")
                }}
                className="w-full text-xs rounded-lg border bg-background p-2"
              >
                <option value="present">Present (Full Day - 8h)</option>
                <option value="od">On Duty (OD — Active Workforce, Not Absent)</option>
                <option value="half_day">Half Day (4 Hours)</option>
                <option value="on_leave">On Leave</option>
                <option value="absent">Absent</option>
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

            <div className="space-y-1.5">
              <label className="text-xs font-semibold">HR Note / Reason</label>
              <Input
                placeholder="Reason or notes for attendance update..."
                value={targetRemarks}
                onChange={(e) => setTargetRemarks(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setMarkModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={submittingMark} className="bg-primary">
                {submittingMark ? "Saving..." : "Save Attendance Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

