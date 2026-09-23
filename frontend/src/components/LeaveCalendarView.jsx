import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Calendar, ChevronLeft, ChevronRight, Users, UserCheck, Umbrella, AlertCircle, Sun, CheckCircle2 } from "lucide-react"

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]

const STATUS_COLORS = {
  submitted: "bg-amber-400",
  approved: "bg-green-400",
  rejected: "bg-red-400",
  pending: "bg-blue-400",
  cancelled: "bg-gray-400"
}

function LeaveDot({ status }) {
  return <span className={`w-1.5 h-1.5 rounded-full inline-block ${STATUS_COLORS[status] || "bg-gray-400"}`} />
}

export default function LeaveCalendarView({ currentUser }) {
  const [leaveRequests, setLeaveRequests] = useState([])
  const [holidays, setHolidays] = useState([])
  const [month, setMonth] = useState(new Date().getMonth())
  const [year, setYear] = useState(new Date().getFullYear())
  const [hoveredDate, setHoveredDate] = useState(null)
  const [filterStatus, setFilterStatus] = useState("all")

  // Selected date availability state
  const todayStr = new Date().toISOString().slice(0, 10)
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [availability, setAvailability] = useState(null)
  const [loadingAvail, setLoadingAvail] = useState(false)
  const [activeTab, setActiveTab] = useState("available") // "available" | "on_leave"

  const role = (currentUser?.role || "").toLowerCase()
  const isManager = role === "admin" || role === "hr" || role === "manager"

  const loadData = async () => {
    try {
      const [lr, hr] = await Promise.all([fetch("/api/leave-requests"), fetch("/api/holidays")])
      if (lr.ok) setLeaveRequests(await lr.json())
      if (hr.ok) setHolidays(await hr.json())
    } catch (_) {}
  }

  const fetchAvailability = async (dateStr) => {
    setLoadingAvail(true)
    try {
      const res = await fetch(`/api/availability?date=${dateStr}`)
      if (res.ok) {
        const data = await res.json()
        setAvailability(data)
      }
    } catch (_) {}
    setLoadingAvail(false)
  }

  useEffect(() => {
    loadData()
    fetchAvailability(todayStr)
  }, [])

  const handleDaySelect = (dateStr) => {
    setSelectedDate(dateStr)
    fetchAvailability(dateStr)
  }

  const filteredLeaves = filterStatus === "all" ? leaveRequests : leaveRequests.filter(l => l.status === filterStatus)

  // Build date-to-leaves map
  const dateMap = {}
  filteredLeaves.forEach(lr => {
    if (!lr.fromDate || !lr.toDate) return
    let cur = new Date(lr.fromDate)
    const end = new Date(lr.toDate)
    while (cur <= end) {
      const key = cur.toISOString().slice(0, 10)
      if (!dateMap[key]) dateMap[key] = []
      dateMap[key].push(lr)
      cur.setDate(cur.getDate() + 1)
    }
  })

  const holidayMap = {}
  holidays.forEach(h => { holidayMap[h.date] = h })

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = Array(firstDay).fill(null).concat([...Array(daysInMonth)].map((_, i) => i + 1))

  // Month-level stats
  const monthLeaves = leaveRequests.filter(lr => {
    if (!lr.fromDate) return false
    const d = new Date(lr.fromDate)
    return d.getFullYear() === year && d.getMonth() === month
  })

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leave Calendar & Team Availability</h1>
        <p className="text-sm text-muted-foreground">Inspect team schedule, approved leaves, and live workforce availability for any date</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-7 w-7"
                  onClick={() => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <CardTitle className="text-base w-36 text-center">{MONTHS[month]} {year}</CardTitle>
                <Button variant="ghost" size="icon" className="h-7 w-7"
                  onClick={() => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }}>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                  className="text-xs rounded-md border bg-background px-2 py-1.5 focus:outline-none h-7">
                  <option value="all">All Leave Status</option>
                  <option value="submitted">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleDaySelect(todayStr)}>
                  Today
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 mb-2">
              {DAYS.map(d => (
                <div key={d} className={`text-center text-[10px] font-semibold py-1 ${d === "Sun" ? "text-red-500 font-bold" : (d === "Sat" ? "text-muted-foreground/70" : "text-muted-foreground")}`}>
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {cells.map((day, i) => {
                if (!day) return <div key={i} />
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                const leaves = dateMap[dateStr] || []
                const hol = holidayMap[dateStr]
                const isToday = dateStr === todayStr
                const isSelected = dateStr === selectedDate
                const dayOfWeek = new Date(dateStr).getDay()
                const isSunday = dayOfWeek === 0

                return (
                  <div key={i}
                    onClick={() => handleDaySelect(dateStr)}
                    className={`relative rounded-lg p-1.5 text-xs flex flex-col items-center min-h-[58px] transition-all cursor-pointer select-none
                      ${isSelected ? "ring-2 ring-primary shadow-sm font-semibold" : "border hover:border-primary/50"}
                      ${isToday ? "bg-primary/10 text-primary border-primary/40 font-bold" : "bg-card"}
                      ${hol && !isToday ? "bg-red-50/70 dark:bg-red-950/20 border-red-200" : ""}
                      ${isSunday && !isToday ? "bg-muted/30 text-muted-foreground/70" : ""}
                    `}
                    onMouseEnter={() => (leaves.length > 0 || hol) && setHoveredDate(dateStr)}
                    onMouseLeave={() => setHoveredDate(null)}
                  >
                    <div className="w-full flex justify-between items-center px-1">
                      <span className={`text-xs ${isSunday ? "text-red-500 font-semibold" : ""}`}>{day}</span>
                      {isToday && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    </div>
                    {hol && <span className="text-[8px] text-red-500 font-semibold leading-tight truncate w-full text-center mt-0.5">{hol.name.split(" ")[0]}</span>}
                    {isSunday && !hol && <span className="text-[8px] text-muted-foreground/50 mt-0.5">Off</span>}
                    <div className="flex flex-wrap gap-0.5 mt-auto justify-center">
                      {leaves.slice(0, 3).map((lr, j) => <LeaveDot key={j} status={lr.status} />)}
                      {leaves.length > 3 && <span className="text-[8px] text-muted-foreground">+{leaves.length - 3}</span>}
                    </div>
                    {hoveredDate === dateStr && (leaves.length > 0 || hol) && (
                      <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-20 bg-popover text-popover-foreground text-[10px] px-2.5 py-2 rounded-lg shadow-xl border min-w-[150px] space-y-1">
                        {hol && <p className="font-bold text-red-600 border-b pb-0.5">{hol.name}</p>}
                        {leaves.slice(0, 4).map((lr, j) => (
                          <div key={j} className="flex items-center gap-1.5">
                            <LeaveDot status={lr.status} />
                            <span className="truncate max-w-[120px] font-medium">{lr.employeeName} ({lr.leaveTypeName || "Leave"})</span>
                          </div>
                        ))}
                        {leaves.length > 4 && <p className="text-muted-foreground pt-0.5">+{leaves.length - 4} more</p>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t text-[10px]">
              {Object.entries(STATUS_COLORS).map(([s, c]) => (
                <span key={s} className="flex items-center gap-1 capitalize text-muted-foreground">
                  <span className={`w-2 h-2 rounded-full ${c}`} />{s}
                </span>
              ))}
              <span className="flex items-center gap-1 text-muted-foreground">
                <span className="w-2 h-2 rounded bg-red-100 border border-red-300" />Holiday
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <span className="w-2 h-2 rounded bg-muted border" />Sunday Off
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Selected Date Availability Roster Panel */}
        <div className="space-y-4">
          <Card className="border-2 border-primary/20 shadow-sm">
            <CardHeader className="pb-3 bg-muted/20 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    {new Date(selectedDate).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    {selectedDate === todayStr ? "Today's Workforce Schedule" : "Selected Date Schedule"}
                  </CardDescription>
                </div>
                {availability?.holiday && (
                  <Badge variant="destructive" className="text-[10px]">
                    {availability.holiday.name}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {availability?.isSunday ? (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 text-center space-y-1">
                  <Sun className="w-6 h-6 text-amber-600 mx-auto" />
                  <p className="text-sm font-bold text-amber-900 dark:text-amber-300">Sunday Weekly Off</p>
                  <p className="text-xs text-amber-700/80">Regular office operations closed. All staff on weekend break.</p>
                </div>
              ) : (
                <>
                  {/* Availability Metrics */}
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="p-2.5 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200">
                      <p className="text-[10px] text-green-700 font-semibold uppercase tracking-wider">Available for Work</p>
                      <p className="text-2xl font-bold text-green-600 mt-0.5">{availability?.availableCount ?? "—"}</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200">
                      <p className="text-[10px] text-red-700 font-semibold uppercase tracking-wider">On Approved Leave</p>
                      <p className="text-2xl font-bold text-red-600 mt-0.5">{availability?.onLeaveCount ?? 0}</p>
                    </div>
                  </div>

                  {/* Tab Switcher */}
                  <div className="flex border rounded-lg p-0.5 bg-muted/40">
                    <button
                      onClick={() => setActiveTab("available")}
                      className={`flex-1 py-1 text-xs font-semibold rounded-md transition-all ${
                        activeTab === "available" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Available Staff ({availability?.availableCount ?? 0})
                    </button>
                    <button
                      onClick={() => setActiveTab("on_leave")}
                      className={`flex-1 py-1 text-xs font-semibold rounded-md transition-all ${
                        activeTab === "on_leave" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      On Leave ({availability?.onLeaveCount ?? 0})
                    </button>
                  </div>

                  {/* Tab Content */}
                  <div className="max-h-[280px] overflow-y-auto space-y-2 pr-1">
                    {activeTab === "available" ? (
                      availability?.availableEmployees?.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No staff marked available on this day.</p>
                      ) : (
                        availability?.availableEmployees?.map(emp => (
                          <div key={emp.userId || emp.id} className="flex items-center justify-between p-2 rounded-lg border bg-card text-xs">
                            <div className="min-w-0 pr-2">
                              <p className="font-semibold text-foreground truncate">{emp.name}</p>
                              <p className="text-[10px] text-muted-foreground capitalize">{emp.role || "Staff"} • {emp.email}</p>
                              {emp.note && <p className="text-[10px] text-amber-600 font-medium mt-0.5">{emp.note}</p>}
                            </div>
                            <Badge variant="outline" className="shrink-0 bg-green-50 text-green-700 border-green-200 text-[10px] font-semibold">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Ready
                            </Badge>
                          </div>
                        ))
                      )
                    ) : (
                      availability?.onLeaveEmployees?.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">No employees on leave on this date.</p>
                      ) : (
                        availability?.onLeaveEmployees?.map(l => (
                          <div key={l.userId} className="p-2 rounded-lg border border-red-200 bg-red-50/50 dark:bg-red-950/20 text-xs space-y-1">
                            <div className="flex justify-between items-center">
                              <p className="font-bold text-foreground">{l.name}</p>
                              <Badge variant="destructive" className="text-[9px] py-0">{l.leaveTypeName || "Leave"}</Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground italic">"{l.reason || "Approved leave"}"</p>
                            <p className="text-[10px] text-muted-foreground">{l.fromDate} → {l.toDate}</p>
                            {l.presentDespiteLeave && (
                              <p className="text-[10px] text-green-700 font-semibold pt-0.5">
                                ⚠️ Attended work today: "{l.leavePresentReason}"
                              </p>
                            )}
                          </div>
                        ))
                      )
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Month Stats Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Month Overview ({MONTHS[month]})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Requests</span>
                  <span className="font-semibold">{monthLeaves.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Approved Leaves</span>
                  <span className="font-semibold text-green-600">{monthLeaves.filter(l => l.status === "approved").length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pending Review</span>
                  <span className="font-semibold text-amber-600">{monthLeaves.filter(l => l.status === "submitted").length}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
