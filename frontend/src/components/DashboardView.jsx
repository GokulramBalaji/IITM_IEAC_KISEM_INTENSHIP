import React, { useState, useEffect } from "react"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { 
  Shield, BookOpen, AlertTriangle, CheckSquare, Clock, UserCheck, 
  Umbrella, ArrowRight, PlusCircle, Activity, CalendarCheck, Users, 
  BarChart2, FileText, CheckCircle2, AlertCircle
} from "lucide-react"

function AnimatedCounter({ to }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!to || to === 0) {
      setCount(0)
      return
    }
    let start = 0
    const duration = 600
    const step = Math.max(1, Math.floor(to / 20))
    const intervalTime = Math.floor(duration / (to / step || 1))
    
    const timer = setInterval(() => {
      start += step
      if (start >= to) {
        setCount(to)
        clearInterval(timer)
      } else {
        setCount(start)
      }
    }, Math.max(10, intervalTime))

    return () => clearInterval(timer)
  }, [to])

  return <span>{count}</span>
}

export default function DashboardView({ instruments = [], currentUser, setActiveView }) {
  const role = (currentUser?.role || "engineer").toLowerCase()
  const isIntern = role === "intern" || role === "trainee"
  const isHR = role === "hr"
  const isAdmin = role === "admin"
  const canManageHR = isHR || isAdmin
  const canAccessInventory = !isIntern

  // Work & Attendance state
  const [todayAttendance, setTodayAttendance] = useState(null)
  const [tasks, setTasks] = useState([])
  const [leaves, setLeaves] = useState([])
  const [hrStats, setHrStats] = useState(null)
  const [loadingWork, setLoadingWork] = useState(true)

  // Equipment detail filter
  const [activeDetail, setActiveDetail] = useState("available")

  useEffect(() => {
    const fetchWorkData = async () => {
      setLoadingWork(true)
      try {
        const promises = [
          fetch("/api/attendance/today").then(r => r.ok ? r.json() : null),
          fetch("/api/tasks").then(r => r.ok ? r.json() : []),
          fetch("/api/leave-requests").then(r => r.ok ? r.json() : [])
        ]
        if (canManageHR) {
          promises.push(fetch("/api/hr-stats?timeframe=day").then(r => r.ok ? r.json() : null))
        }

        const [att, tList, lList, hrData] = await Promise.all(promises)
        setTodayAttendance(att)
        setTasks(Array.isArray(tList) ? tList : [])
        setLeaves(Array.isArray(lList) ? lList : [])
        if (hrData) setHrStats(hrData)
      } catch (e) {
        console.error("Dashboard work data fetch failed:", e)
      } finally {
        setLoadingWork(false)
      }
    }

    fetchWorkData()
  }, [currentUser, canManageHR])

  // Work metrics calculation
  const myTasks = tasks.filter(t => String(t.assignedTo) === String(currentUser?.id))
  const myPendingTasks = myTasks.filter(t => t.status === "in_progress" || t.status === "assigned")
  const myCompletedToday = myTasks.filter(t => {
    if (t.status !== "completed") return false
    const d = t.updatedAt || t.date
    return d && d.slice(0, 10) === new Date().toISOString().slice(0, 10)
  })

  // Leave metrics calculation
  const myLeaves = leaves.filter(l => String(l.userId) === String(currentUser?.id))
  const myPendingLeaves = myLeaves.filter(l => l.status === "submitted")
  const todayStr = new Date().toISOString().slice(0, 10)
  const activeTodayLeave = myLeaves.find(l => l.status === "approved" && todayStr >= l.fromDate && todayStr <= l.toDate)

  // Equipment metrics
  const availableList = instruments.filter(i => i.status === "available")
  const bookedList = instruments.filter(i => i.status === "booked")
  const dueList = instruments.filter(i => {
    if (!i.nextCalibrationDate) return false
    const dueMs = new Date(i.nextCalibrationDate) - new Date()
    return dueMs >= 0 && dueMs < 15 * 24 * 3600 * 1000
  })

  const isDueSoon = (dateStr) => {
    if (!dateStr) return false
    const dueMs = new Date(dateStr) - new Date()
    return dueMs >= 0 && dueMs < 15 * 24 * 3600 * 1000
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Welcome back, {currentUser?.name || "Team Member"}!
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Role: <span className="font-semibold uppercase tracking-wider text-primary">{role}</span> · IIT Madras IEAC Operations
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 cursor-pointer" onClick={() => setActiveView && setActiveView("tasks")}>
            <CheckSquare className="w-3.5 h-3.5 text-primary" /> Log Task
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 cursor-pointer" onClick={() => setActiveView && setActiveView("my-leaves")}>
            <Umbrella className="w-3.5 h-3.5 text-amber-500" /> Apply Leave
          </Button>
          <Button size="sm" className="gap-1.5 text-xs h-8 cursor-pointer" onClick={() => setActiveView && setActiveView("attendance")}>
            <UserCheck className="w-3.5 h-3.5" /> Attendance
          </Button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          SECTION 1 (TOP PRIORITY): WORK MANAGEMENT & LEAVE MANAGEMENT OVERVIEW
      ══════════════════════════════════════════════════════════════════════════ */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-foreground">Work & Leave Overview</h2>
            <Badge variant="outline" className="text-[10px] font-semibold bg-primary/5 text-primary border-primary/20">
              High Priority
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">{new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Today's Attendance Status */}
          <Card 
            className="hover:shadow-md transition-all duration-300 border-l-4 border-l-emerald-500 cursor-pointer group bg-card"
            onClick={() => setActiveView && setActiveView("attendance")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Attendance Today</CardTitle>
              <UserCheck className="w-4 h-4 text-emerald-500 group-hover:scale-110 transition-transform" />
            </CardHeader>
            <CardContent>
              {todayAttendance?.checkIn ? (
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-emerald-600">Present</span>
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px] h-4">
                      {todayAttendance.checkOut ? "Completed" : "Checked In"}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    In: <strong className="text-foreground">{new Date(todayAttendance.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
                    {todayAttendance.checkOut && ` · Out: ${new Date(todayAttendance.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                  </p>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-amber-600">Pending</span>
                    <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-[10px] h-4">Not Checked In</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Click to record your check-in time</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card 2: Work & Tasks Today */}
          <Card 
            className="hover:shadow-md transition-all duration-300 border-l-4 border-l-blue-500 cursor-pointer group bg-card"
            onClick={() => setActiveView && setActiveView("tasks")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Tasks</CardTitle>
              <CheckSquare className="w-4 h-4 text-blue-500 group-hover:scale-110 transition-transform" />
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-foreground">
                  <AnimatedCounter to={myPendingTasks.length} />
                </span>
                <span className="text-xs text-muted-foreground">in progress</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Completed today: <strong className="text-emerald-600">{myCompletedToday.length}</strong> · Total assigned: {myTasks.length}
              </p>
            </CardContent>
          </Card>

          {/* Card 3: My Leaves Overview */}
          <Card 
            className="hover:shadow-md transition-all duration-300 border-l-4 border-l-amber-500 cursor-pointer group bg-card"
            onClick={() => setActiveView && setActiveView("my-leaves")}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Leave Status</CardTitle>
              <Umbrella className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform" />
            </CardHeader>
            <CardContent>
              {activeTodayLeave ? (
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-bold text-amber-600">On Leave Today</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 truncate">
                    {activeTodayLeave.leaveTypeName} ({activeTodayLeave.fromDate})
                  </p>
                </div>
              ) : (
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-foreground">
                      <AnimatedCounter to={myPendingLeaves.length} />
                    </span>
                    <span className="text-xs text-muted-foreground">pending approval</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {myLeaves.length} total request(s) on record
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Card 4: HR Workforce Pulse (For HR/Admin) or Daily Reports (For Staff) */}
          {canManageHR ? (
            <Card 
              className="hover:shadow-md transition-all duration-300 border-l-4 border-l-purple-500 cursor-pointer group bg-card"
              onClick={() => setActiveView && setActiveView("hr-dashboard")}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Workforce Today</CardTitle>
                <BarChart2 className="w-4 h-4 text-purple-500 group-hover:scale-110 transition-transform" />
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-purple-600">
                    <AnimatedCounter to={hrStats?.membersPresentToday?.length || 0} />
                  </span>
                  <span className="text-xs text-muted-foreground">present now</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Absent: <strong className="text-red-500">{hrStats?.membersAbsentToday?.length || 0}</strong> · On Leave: <strong className="text-amber-600">{hrStats?.membersOnLeaveToday?.length || 0}</strong>
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card 
              className="hover:shadow-md transition-all duration-300 border-l-4 border-l-indigo-500 cursor-pointer group bg-card"
              onClick={() => setActiveView && setActiveView("daily-reports")}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Daily Work Report</CardTitle>
                <FileText className="w-4 h-4 text-indigo-500 group-hover:scale-110 transition-transform" />
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-bold text-indigo-600">Submit Daily Log</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Summarize tasks & hours worked before end of shift
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          SECTION 2: EQUIPMENT INVENTORY & ASSETS (SHOWN FOR NON-INTERN ROLES)
      ══════════════════════════════════════════════════════════════════════════ */}
      {canAccessInventory ? (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground">Equipment & Inventory Assets</h2>
            <Button size="sm" variant="ghost" className="text-xs text-primary gap-1 h-7" onClick={() => setActiveView && setActiveView("inventory")}>
              View All Instruments <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card
              className={`hover:shadow-md transition-all duration-300 border-l-4 border-l-primary group cursor-pointer ${activeDetail === 'available' ? 'ring-2 ring-primary/20 bg-primary/5' : ''}`}
              onClick={() => setActiveDetail('available')}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Available Instruments</CardTitle>
                <Shield className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  <AnimatedCounter to={availableList.length} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Ready for checkout & field auditing</p>
              </CardContent>
            </Card>

            <Card
              className={`hover:shadow-md transition-all duration-300 border-l-4 border-l-amber-500 group cursor-pointer ${activeDetail === 'booked' ? 'ring-2 ring-amber-300/30 bg-amber-100/20' : ''}`}
              onClick={() => setActiveDetail('booked')}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Booked Instruments</CardTitle>
                <BookOpen className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-tight text-amber-600">
                  <AnimatedCounter to={bookedList.length} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Currently assigned to audit field teams</p>
              </CardContent>
            </Card>

            <Card
              className={`hover:shadow-md transition-all duration-300 border-l-4 border-l-destructive group cursor-pointer ${activeDetail === 'due' ? 'ring-2 ring-destructive/20 bg-destructive/10' : ''}`}
              onClick={() => setActiveDetail('due')}
            >
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Calibration Due</CardTitle>
                <AlertTriangle className="w-4 h-4 text-destructive group-hover:scale-110 transition-transform animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-tight text-destructive">
                  <AnimatedCounter to={dueList.length} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Due within the next 15 days</p>
              </CardContent>
            </Card>
          </div>

          {/* Filtered Instrument Highlights */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold capitalize">
                {activeDetail === 'available' ? 'Available Instruments' : activeDetail === 'booked' ? 'Booked Instruments' : 'Calibration Due Soon'}
              </CardTitle>
              <CardDescription className="text-xs">
                {activeDetail === 'available' && 'Instruments ready for immediate booking.'}
                {activeDetail === 'booked' && 'Instruments currently checked out by personnel.'}
                {activeDetail === 'due' && 'Instruments requiring calibration within 15 days.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(activeDetail === 'available' ? availableList : activeDetail === 'booked' ? bookedList : dueList)
                  .slice(0, 6)
                  .map((it, idx) => (
                    <div key={it.id || idx} className="rounded-xl border bg-background/80 p-3 shadow-sm hover:shadow-md transition-all">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-xs text-foreground truncate">{it.name || 'Unknown Instrument'}</h3>
                          <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{it.brand || 'Brand not set'} · {it.model || 'Model not set'}</div>
                        </div>
                        {it.productImages && it.productImages.length > 0 ? (
                          <img src={it.productImages[0]} alt={it.name} className="h-10 w-10 rounded-lg object-cover border shrink-0" />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-[9px] text-muted-foreground shrink-0">No image</div>
                        )}
                      </div>
                      <div className="mt-2.5 flex items-center justify-between text-[10px] text-muted-foreground border-t pt-2">
                        <span>Status: <strong className="text-foreground capitalize">{it.status}</strong></span>
                        {it.nextCalibrationDate && (
                          <span className={isDueSoon(it.nextCalibrationDate) ? "text-destructive font-semibold" : ""}>
                            Cal: {new Date(it.nextCalibrationDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                {(activeDetail === 'available' ? availableList : activeDetail === 'booked' ? bookedList : dueList).length === 0 && (
                  <div className="col-span-full rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                    No instruments in this category.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Intern Recent Task Work View */
        <Card className="shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">My Assigned Tasks</CardTitle>
                <CardDescription className="text-xs">Your current active engineering and field tasks</CardDescription>
              </div>
              <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setActiveView && setActiveView("tasks")}>
                View All Tasks <ArrowRight className="w-3 h-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {myTasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-xs">
                No tasks currently assigned. Click "Log Task" to record work updates.
              </div>
            ) : (
              <div className="space-y-2">
                {myTasks.slice(0, 5).map(t => (
                  <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border text-xs">
                    <div>
                      <p className="font-semibold text-foreground">{t.title}</p>
                      <p className="text-[10px] text-muted-foreground">{t.description || "No description"} · Due: {t.dueDate || "N/A"}</p>
                    </div>
                    <Badge variant={t.status === "completed" ? "success" : "default"} className="capitalize text-[10px]">
                      {t.status.replace("_", " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
