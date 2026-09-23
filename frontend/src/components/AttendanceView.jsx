import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Clock, LogIn, LogOut, CheckCircle2, Activity, Calendar, Users, UserCheck, UserX, AlertTriangle, ShieldCheck } from "lucide-react"

function formatTime(ts) {
  if (!ts) return "—"
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function formatDate(d) {
  return new Date(d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })
}

export default function AttendanceView({ currentUser }) {
  const role = (currentUser?.role || "").toLowerCase()
  const isHR = role === "admin" || role === "hr"

  const [activeTab, setActiveTab] = useState("self") // "self" | "hr_management"

  // Self Attendance States
  const [today, setToday] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [tick, setTick] = useState(new Date())

  // HR Workforce Management States
  const [allUsers, setAllUsers] = useState([])
  const [allAttendance, setAllAttendance] = useState([])
  const [selectedManageDate, setSelectedManageDate] = useState(new Date().toISOString().slice(0, 10))
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

  useEffect(() => {
    const iv = setInterval(() => setTick(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])

  const loadSelf = async () => {
    setLoading(true)
    try {
      const [tr, hr] = await Promise.all([fetch("/api/attendance/today"), fetch("/api/attendance")])
      if (tr.ok) setToday(await tr.json())
      if (hr.ok) {
        const all = await hr.json()
        const mine = all.filter(a => String(a.userId) === String(currentUser?.id))
          .sort((a, b) => new Date(b.date) - new Date(a.date))
        setHistory(mine.slice(0, 30))
      }
    } catch (_) {}
    setLoading(false)
  }

  const loadHRData = async () => {
    if (!isHR) return
    try {
      const [ur, ar] = await Promise.all([fetch("/api/users"), fetch("/api/attendance")])
      if (ur.ok) setAllUsers(await ur.json())
      if (ar.ok) setAllAttendance(await ar.json())
    } catch (_) {}
  }

  useEffect(() => {
    loadSelf()
    if (isHR) loadHRData()
  }, [])

  const checkIn = async () => {
    setActing(true)
    try {
      const res = await fetch("/api/attendance/checkin", { method: "POST" })
      if (res.ok) {
        loadSelf()
        if (isHR) loadHRData()
      } else {
        const d = await res.json()
        alert(d.error)
      }
    } catch (_) {}
    setActing(false)
  }

  const checkOut = async () => {
    setActing(true)
    try {
      const res = await fetch("/api/attendance/checkout", { method: "POST" })
      if (res.ok) {
        loadSelf()
        if (isHR) loadHRData()
      } else {
        const d = await res.json()
        alert(d.error)
      }
    } catch (_) {}
    setActing(false)
  }

  // Open HR Mark Modal
  const openMarkModal = (user, status) => {
    setTargetEmployee(user)
    setTargetStatus(status)
    setTargetRemarks(status === "present" ? "Verified on duty by HR" : "Marked absent by HR")
    setMarkModalOpen(true)
  }

  const handleHRSubmitMark = async (e) => {
    if (e) e.preventDefault()
    if (!targetEmployee) return
    setSubmittingMark(true)

    try {
      const checkInIso = targetStatus === "present" ? `${selectedManageDate}T${targetCheckIn}:00.000Z` : null
      const checkOutIso = targetStatus === "present" ? `${selectedManageDate}T${targetCheckOut}:00.000Z` : null

      const res = await fetch("/api/hr/attendance/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: targetEmployee.id,
          date: selectedManageDate,
          status: targetStatus,
          checkIn: checkInIso,
          checkOut: checkOutIso,
          remarks: targetRemarks
        })
      })

      if (res.ok) {
        setMarkModalOpen(false)
        loadHRData()
      } else {
        const d = await res.json()
        alert(d.error || "Failed to update attendance.")
      }
    } catch (err) {
      console.error("Manual mark failed", err)
    } finally {
      setSubmittingMark(false)
    }
  }

  const elapsedHours = today?.checkIn && !today?.checkOut
    ? ((new Date() - new Date(today.checkIn)) / 3600000).toFixed(2)
    : null

  const weekHistory = history.slice(0, 5)
  const totalHoursThisWeek = weekHistory.reduce((s, a) => s + (a.workingHours || 0), 0).toFixed(1)
  const avgHours = weekHistory.length > 0 ? (totalHoursThisWeek / weekHistory.length).toFixed(1) : 0

  // HR Workforce filtered list for the selected date
  const filteredHRList = allUsers.filter(u => {
    const matchSearch = (u.name || "").toLowerCase().includes(searchEmployee.toLowerCase()) ||
                        (u.email || "").toLowerCase().includes(searchEmployee.toLowerCase())
    if (!matchSearch) return false

    const att = allAttendance.find(a => String(a.userId) === String(u.id) && a.date === selectedManageDate)
    const currentStatus = att?.status || "not_marked"

    if (statusFilter === "present") return currentStatus === "present"
    if (statusFilter === "absent") return currentStatus === "absent" || currentStatus === "not_marked"
    if (statusFilter === "half_day") return currentStatus === "half_day"
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
                  {today?.checkIn && (
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase">Check In</p>
                        <p className="text-lg font-bold text-green-600">{formatTime(today.checkIn)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase">Duration</p>
                        <p className="text-lg font-bold text-primary">{elapsedHours ? `${elapsedHours}h` : `${today.workingHours}h`}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase">Check Out</p>
                        <p className="text-lg font-bold text-muted-foreground">{formatTime(today.checkOut)}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-3">
                    {!today?.checkIn ? (
                      <Button onClick={checkIn} disabled={acting} size="lg" className="gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold">
                        <LogIn className="w-4 h-4" />Check In
                      </Button>
                    ) : !today?.checkOut ? (
                      <Button onClick={checkOut} disabled={acting} size="lg" variant="outline" className="gap-2 border-red-500 text-red-600 hover:bg-red-50 font-semibold">
                        <LogOut className="w-4 h-4" />Check Out
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2 text-green-600 font-semibold text-sm">
                        <CheckCircle2 className="w-5 h-5" />Day Completed ({today.workingHours} hrs)
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
              { label: "Status Today", value: today?.checkIn ? (today.checkOut ? "Completed" : "Checked In") : "Not Checked In", sub: today?.date || "Today" },
              { label: "Attendance Rate", value: `${Math.min(100, Math.round((weekHistory.filter(h => h.status === 'present').length / 5) * 100))}%`, sub: "Last 5 days" }
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
                      {history.map(a => (
                        <tr key={a.id || a.date} className="hover:bg-muted/40 transition-colors">
                          <td className="py-2.5 font-medium">{formatDate(a.date)}</td>
                          <td className="py-2.5">
                            <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              a.status === "present" ? "bg-green-100 text-green-700" :
                              a.status === "half_day" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"
                            }`}>
                              {a.presentDespiteLeave ? "Present (Leave Override)" : (a.status || "present")}
                            </span>
                          </td>
                          <td className="py-2.5 text-muted-foreground font-mono">{formatTime(a.checkIn)}</td>
                          <td className="py-2.5 text-muted-foreground font-mono">{formatTime(a.checkOut)}</td>
                          <td className="py-2.5 font-semibold text-foreground">{a.workingHours ? `${a.workingHours}h` : "—"}</td>
                          <td className="py-2.5 text-xs text-muted-foreground">{a.leavePresentReason ? `Attended despite leave: ${a.leavePresentReason}` : (a.remarks || "—")}</td>
                        </tr>
                      ))}
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
          <Card className="border-2 border-primary/20">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    Workforce Attendance Management
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Manually mark any employee as Present, Absent, or Half-Day for any date
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
                    <option value="all">All Statuses</option>
                    <option value="present">Present</option>
                    <option value="absent">Absent / Not Marked</option>
                    <option value="half_day">Half Day</option>
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
                        const att = allAttendance.find(a => String(a.userId) === String(u.id) && a.date === selectedManageDate)
                        const isPresent = att?.status === "present" || !!att?.checkIn
                        const isHalfDay = att?.status === "half_day"
                        const isAbsent = att?.status === "absent"

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
                              <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                isPresent ? "bg-green-100 text-green-700" :
                                isHalfDay ? "bg-amber-100 text-amber-700" :
                                isAbsent ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-500"
                              }`}>
                                {att?.presentDespiteLeave ? "Present (Leave Override)" : (att?.status || "Not Marked")}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-xs font-mono">
                              {att?.checkIn ? `${formatTime(att.checkIn)} → ${att.checkOut ? formatTime(att.checkOut) : "Active"}` : "—"}
                            </td>
                            <td className="py-3 px-3 text-xs text-muted-foreground max-w-[180px] truncate">
                              {att?.leavePresentReason ? `Attended despite leave: ${att.leavePresentReason}` : (att?.remarks || "—")}
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openMarkModal(u, "present")}
                                  className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                                >
                                  <UserCheck className="w-3.5 h-3.5 mr-1" /> Present
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openMarkModal(u, "absent")}
                                  className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-50"
                                >
                                  <UserX className="w-3.5 h-3.5 mr-1" /> Absent
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openMarkModal(u, "half_day")}
                                  className="h-7 text-xs text-amber-700 hover:bg-amber-50"
                                >
                                  Half-Day
                                </Button>
                              </div>
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
              Mark Employee Attendance ({targetStatus.toUpperCase()})
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
                onChange={(e) => setTargetStatus(e.target.value)}
                className="w-full text-xs rounded-lg border bg-background p-2"
              >
                <option value="present">Present (Full Day)</option>
                <option value="half_day">Half Day (4 Hours)</option>
                <option value="absent">Absent</option>
                <option value="on_leave">On Leave</option>
              </select>
            </div>

            {targetStatus === "present" && (
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
              <label className="text-xs font-semibold">HR Remarks / Reason</label>
              <Input
                value={targetRemarks}
                onChange={(e) => setTargetRemarks(e.target.value)}
                placeholder="e.g. Approved site audit visit, verified by supervisor..."
                className="text-xs"
                required
              />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setMarkModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submittingMark} className="font-semibold">
                {submittingMark ? "Saving Record..." : "Confirm & Save Attendance"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
