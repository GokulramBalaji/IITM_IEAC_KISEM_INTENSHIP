import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import {
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  Calendar,
  Download,
  FileText,
  Activity,
  Briefcase,
  UserCheck,
  UserX,
  Umbrella,
  FileSpreadsheet,
  Filter
} from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts"

const PIE_COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"]

function StatCard({ label, value, subtitle, icon: Icon, color = "text-primary", border = "border-l-primary", onClick }) {
  return (
    <Card className={`border-l-4 ${border} ${onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`} onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <Icon className="w-5 h-5 text-muted-foreground/40 shrink-0" />
        </div>
      </CardContent>
    </Card>
  )
}

export default function HRDashboardView({ currentUser }) {
  const [timeframe, setTimeframe] = useState("month") // "day" | "week" | "month" | "custom"
  const todayStr = new Date().toISOString().slice(0, 10)
  const defaultPast7 = new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const [startDate, setStartDate] = useState(defaultPast7)
  const [endDate, setEndDate] = useState(todayStr)

  const [stats, setStats] = useState(null)
  const [taskReport, setTaskReport] = useState(null)
  const [leaveReport, setLeaveReport] = useState([])
  const [dailyReports, setDailyReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [downloadingExcel, setDownloadingExcel] = useState(false)

  // Inspection modal states for Present / Absent / On Leave today
  const [inspectModalOpen, setInspectModalOpen] = useState(false)
  const [inspectTitle, setInspectTitle] = useState("")
  const [inspectList, setInspectList] = useState([])
  const [inspectType, setInspectType] = useState("")

  const loadStats = async () => {
    setLoading(true)
    try {
      const q = timeframe === "custom"
        ? `timeframe=custom&startDate=${startDate}&endDate=${endDate}`
        : `timeframe=${timeframe}`

      const [sr, tr, lr, dr] = await Promise.all([
        fetch(`/api/hr-stats?${q}`),
        fetch("/api/reports/tasks"),
        fetch("/api/reports/leaves"),
        fetch("/api/reports/daily")
      ])

      if (sr.ok) setStats(await sr.json())
      if (tr.ok) setTaskReport(await tr.json())
      if (lr.ok) setLeaveReport(await lr.json())
      if (dr.ok) setDailyReports(await dr.json())
    } catch (err) {
      console.error("Failed to load HR stats", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStats()
  }, [timeframe])

  const handleCustomFilterApply = () => {
    loadStats()
  }

  // Multi-day sheet-per-day Excel download handler
  const handleExportMultiSheetExcel = async () => {
    setDownloadingExcel(true)
    try {
      const s = timeframe === "custom" ? startDate : (stats?.period?.startDate || startDate)
      const e = timeframe === "custom" ? endDate : (stats?.period?.endDate || endDate)
      const downloadUrl = `/api/reports/hr-multi-sheet-excel?startDate=${s}&endDate=${e}`

      const res = await fetch(downloadUrl)
      if (!res.ok) throw new Error("Excel export failed.")
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `IITM_IEAC_HR_Report_${s}_${e}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      alert("Failed to export Excel report: " + err.message)
    } finally {
      setDownloadingExcel(false)
    }
  }

  const openInspector = (type) => {
    setInspectType(type)
    if (type === "present") {
      setInspectTitle("Members Present Today")
      setInspectList(stats?.membersPresentToday || [])
    } else if (type === "absent") {
      setInspectTitle("Members Absent Today")
      setInspectList(stats?.membersAbsentToday || [])
    } else if (type === "leave") {
      setInspectTitle("Members on Approved Leave Today")
      setInspectList(stats?.membersOnLeaveToday || [])
    }
    setInspectModalOpen(true)
  }

  // Task status distribution
  const taskPieData = taskReport ? [
    { name: "Completed", value: taskReport.completed },
    { name: "In Progress", value: taskReport.inProgress },
    { name: "Overdue", value: taskReport.overdue },
    { name: "Not Started", value: taskReport.notStarted },
  ].filter(d => d.value > 0) : []

  if (loading && !stats) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <h1 className="text-2xl font-bold">HR Workforce Analytics</h1>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(8)].map((_, i) => <div key={i} className="h-24 rounded-xl border bg-muted animate-pulse" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header with Timeframe and Excel Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">HR Workforce Analytics & Reporting</h1>
          <p className="text-sm text-muted-foreground">Attendance percentages, tasks completed by staff, and multi-day Excel reporting</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Timeframe selector */}
          <div className="flex border rounded-lg p-0.5 bg-muted/40">
            {[
              { id: "day", label: "Day (Today)" },
              { id: "week", label: "Week" },
              { id: "month", label: "Month" },
              { id: "custom", label: "Custom Range" }
            ].map(btn => (
              <button
                key={btn.id}
                onClick={() => setTimeframe(btn.id)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                  timeframe === btn.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Export Comprehensive Multi-Day Excel Button */}
          <Button
            onClick={handleExportMultiSheetExcel}
            disabled={downloadingExcel}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-8 cursor-pointer shadow-sm"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            {downloadingExcel ? "Generating Sheets..." : "Export Multi-Day Excel (Sheet-per-Day)"}
          </Button>
        </div>
      </div>

      {/* Custom Date Range Picker when Custom selected */}
      {timeframe === "custom" && (
        <Card className="bg-muted/20 border-dashed">
          <CardContent className="p-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-primary" /> Filter Date Range:
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">From:</span>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-7 text-xs w-36"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">To:</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-7 text-xs w-36"
                />
              </div>
              <Button size="sm" onClick={handleCustomFilterApply} className="h-7 text-xs">
                Apply Date Range
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's Live Workforce Status Bar */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Today's Workforce Roster ({todayStr})</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="Total Registered Staff"
            value={stats?.totalEmployees || 0}
            subtitle="Full active workforce"
            icon={Users}
            border="border-l-primary"
          />
          <StatCard
            label="Members Present Today"
            value={stats?.presentToday || 0}
            subtitle="Click to view checked-in staff"
            icon={UserCheck}
            color="text-green-600"
            border="border-l-green-500"
            onClick={() => openInspector("present")}
          />
          <StatCard
            label="Members Absent Today"
            value={stats?.absentToday || 0}
            subtitle="Click to view absent staff"
            icon={UserX}
            color="text-red-600"
            border="border-l-red-500"
            onClick={() => openInspector("absent")}
          />
          <StatCard
            label="On Approved Leave"
            value={stats?.onLeaveToday || 0}
            subtitle="Click to view leave reasons"
            icon={Umbrella}
            color="text-amber-600"
            border="border-l-amber-500"
            onClick={() => openInspector("leave")}
          />
        </div>
      </div>

      {/* Primary Table: Attendance Percentage & Tasks Done by Every Employee */}
      <Card className="border-2 border-primary/20 shadow-sm">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Staff Attendance Percentage & Task Execution Report
              </CardTitle>
              <CardDescription className="text-xs">
                Period: <strong>{stats?.period?.startDate}</strong> to <strong>{stats?.period?.endDate}</strong> ({stats?.period?.workingDays} working days)
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs font-medium self-start sm:self-auto capitalize">
              Timeframe: {timeframe}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground bg-muted/10">
                  <th className="text-left py-3 px-4 font-semibold">Employee</th>
                  <th className="text-left py-3 px-3 font-semibold">Role</th>
                  <th className="text-center py-3 px-3 font-semibold">Working Days</th>
                  <th className="text-center py-3 px-3 font-semibold text-green-700">Days Present</th>
                  <th className="text-center py-3 px-3 font-semibold text-red-600">Days Absent</th>
                  <th className="text-left py-3 px-4 font-semibold">Attendance Rate</th>
                  <th className="text-center py-3 px-3 font-semibold">Tasks Done</th>
                  <th className="text-left py-3 px-4 font-semibold">Task Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(stats?.employeeMetrics || []).map((emp, idx) => {
                  const attPct = emp.attendancePercentage || 0
                  const taskPct = emp.taskCompletionRate || 0

                  return (
                    <tr key={emp.userId} className="hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4">
                        <p className="font-semibold text-foreground text-xs">{emp.name}</p>
                        <p className="text-[10px] text-muted-foreground">{emp.email}</p>
                      </td>
                      <td className="py-3 px-3">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {emp.role || "Staff"}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-center text-xs font-mono font-medium">
                        {emp.workingDays}
                      </td>
                      <td className="py-3 px-3 text-center text-xs font-mono font-bold text-green-600">
                        {emp.daysPresent}
                      </td>
                      <td className="py-3 px-3 text-center text-xs font-mono font-semibold text-red-600">
                        {emp.daysAbsent}
                      </td>
                      <td className="py-3 px-4 min-w-[150px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                attPct >= 90 ? "bg-green-500" : attPct >= 75 ? "bg-amber-500" : "bg-red-500"
                              }`}
                              style={{ width: `${attPct}%` }}
                            />
                          </div>
                          <span className={`text-xs font-bold font-mono w-12 text-right ${
                            attPct >= 90 ? "text-green-600" : attPct >= 75 ? "text-amber-600" : "text-red-600"
                          }`}>
                            {attPct}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center text-xs font-mono">
                        <span className="font-bold text-foreground">{emp.completedTasks}</span>
                        <span className="text-muted-foreground text-[10px]"> / {emp.totalTasks}</span>
                      </td>
                      <td className="py-3 px-4 min-w-[130px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${taskPct}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-semibold text-muted-foreground w-9 text-right font-mono">
                            {taskPct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Charts & Day-Wise Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Day-Wise Activity Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              Day-Wise Task & Activity Volume
            </CardTitle>
            <CardDescription className="text-xs">Tasks and daily reports logged per calendar date</CardDescription>
          </CardHeader>
          <CardContent>
            {stats?.tasksDoneDayWise?.length > 0 ? (
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.tasksDoneDayWise.slice(-14)}>
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: "11px", borderRadius: "8px" }} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Bar dataKey="tasksCount" name="Tasks Active" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="completedCount" name="Tasks Completed" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="reportsCount" name="Daily Reports" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-10">No activity data in period.</p>
            )}
          </CardContent>
        </Card>

        {/* Task Status Pie Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-primary" />
              Task Status Distribution
            </CardTitle>
            <CardDescription className="text-xs">Current task execution overview</CardDescription>
          </CardHeader>
          <CardContent>
            {taskPieData.length > 0 ? (
              <div className="h-60 flex flex-col items-center justify-center">
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={taskPieData} cx="50%" cy="50%" innerRadius={42} outerRadius={65} dataKey="value" paddingAngle={3}>
                      {taskPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ fontSize: "11px", borderRadius: "8px" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-2 mt-2">
                  {taskPieData.map((item, idx) => (
                    <span key={item.name} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                      {item.name}: <strong>{item.value}</strong>
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-10">No tasks logged.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Inspector Modal for Present / Absent / On Leave Today */}
      <Dialog open={inspectModalOpen} onOpenChange={setInspectModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              {inspectType === "present" && <UserCheck className="w-4 h-4 text-green-600" />}
              {inspectType === "absent" && <UserX className="w-4 h-4 text-red-600" />}
              {inspectType === "leave" && <Umbrella className="w-4 h-4 text-amber-600" />}
              {inspectTitle} ({inspectList.length})
            </DialogTitle>
            <DialogDescription className="text-xs">
              Employee breakdown for today: <strong>{todayStr}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[300px] overflow-y-auto space-y-2 pt-2 pr-1">
            {inspectList.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No employees in this category today.</p>
            ) : (
              inspectList.map(emp => (
                <div key={emp.id || emp.email} className="p-2.5 rounded-lg border bg-card text-xs space-y-1">
                  <div className="flex justify-between items-center">
                    <p className="font-semibold text-foreground">{emp.name}</p>
                    <Badge variant="outline" className="text-[10px] capitalize">{emp.role || "Staff"}</Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{emp.email}</p>
                  {emp.checkIn && (
                    <p className="text-[10px] text-green-700 font-mono">
                      Checked in at {new Date(emp.checkIn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                  {emp.leaveTypeName && (
                    <p className="text-[10px] text-amber-700 font-medium">
                      Leave Type: {emp.leaveTypeName} {emp.reason ? `("${emp.reason}")` : ""}
                    </p>
                  )}
                  {emp.presentDespiteLeave && (
                    <p className="text-[10px] text-blue-700 font-semibold">
                      ⚠️ Attending work despite approved leave: "{emp.leavePresentReason}"
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
