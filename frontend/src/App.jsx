import React, { useState, useEffect } from "react"
import { io } from "socket.io-client"
import DashboardView from "./components/DashboardView"
import InventoryView from "./components/InventoryView"
import BookingView from "./components/BookingView"
import TransactionView from "./components/TransactionView"
import CalibrationView from "./components/CalibrationView"
import LearningView from "./components/LearningView"
import LoginView from "./components/LoginView"
import UserManagementView from "./components/UserManagementView"
import BookingRequestsView from "./components/BookingRequestsView"
import CalendarView from "./components/CalendarView"
import VendorManagementView from "./components/VendorManagementView"
// HR / Task / Leave modules
import TaskManagementView from "./components/TaskManagementView"
import DailyReportView from "./components/DailyReportView"
import MyLeavesView from "./components/MyLeavesView"
import LeaveApprovalView from "./components/LeaveApprovalView"
import LeaveCalendarView from "./components/LeaveCalendarView"
import HolidayManagementView from "./components/HolidayManagementView"
import AttendanceView from "./components/AttendanceView"
import HRDashboardView from "./components/HRDashboardView"
import AdminSettingsView from "./components/AdminSettingsView"
import NotificationCenter from "./components/NotificationCenter"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import {
  LayoutDashboard,
  Boxes,
  CalendarClock,
  Activity,
  GraduationCap,
  Sun,
  Moon,
  Search,
  User,
  Wifi,
  Sparkles,
  ShieldCheck,
  Users,
  LogOut,
  CalendarDays,
  Menu,
  X,
  Layers,
  Handshake,
  CheckSquare,
  FileText,
  CalendarCheck,
  CalendarRange,
  UserCheck,
  Clock,
  BarChart2,
  Settings,
  Umbrella
} from "lucide-react"

// Connect to socket.io
const socket = io()

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = sessionStorage.getItem("iitm_user")
    return saved ? JSON.parse(saved) : null
  })
  const [activeView, setActiveView] = useState(() => {
    const savedView = sessionStorage.getItem("iitm_active_view")
    return savedView || "dashboard"
  })

  // Save active view state to sessionStorage to survive page refreshes
  useEffect(() => {
    sessionStorage.setItem("iitm_active_view", activeView)
  }, [activeView])
  const [instruments, setInstruments] = useState([])
  const [users, setUsers] = useState([])
  const [searchTerm, setSearchTerm] = useState("")
  const [darkMode, setDarkMode] = useState(false)
  const [socketConnected, setSocketConnected] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Socket notification modal
  const [insightModalOpen, setInsightModalOpen] = useState(false)
  const [insightLines, setInsightLines] = useState([])
  const [refreshBookingsKey, setRefreshBookingsKey] = useState(0)
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0)

  // Active leave popup verification state
  const [activeLeaveModalOpen, setActiveLeaveModalOpen] = useState(false)
  const [activeLeaveInfo, setActiveLeaveInfo] = useState(null)
  const [activeLeaveReason, setActiveLeaveReason] = useState("")
  const [activeLeaveSubmitting, setActiveLeaveSubmitting] = useState(false)

  const loadPendingRequestsCount = async () => {
    const r = (currentUser?.role || "").toLowerCase()
    if (!currentUser || (r !== "admin" && r !== "auditor")) return
    try {
      const res = await fetch("/api/booking-requests")
      if (res.ok) {
        const data = await res.json()
        setPendingRequestsCount(data.length)
      }
    } catch (err) {
      console.error("Failed to load booking requests count", err)
    }
  }

  // Active leave verification check on startup/login
  const checkActiveLeaveForToday = async (user) => {
    if (!user) return
    const today = new Date().toISOString().slice(0, 10)
    const sessionKey = `leave_reason_submitted_${user.id}_${today}`
    if (sessionStorage.getItem(sessionKey)) return

    try {
      const res = await fetch("/api/leave-requests")
      if (!res.ok) return
      const leaves = await res.json()
      const matchingLeave = leaves.find(l =>
        String(l.userId) === String(user.id) &&
        l.status === "approved" &&
        today >= l.fromDate &&
        today <= l.toDate
      )
      if (matchingLeave) {
        // Check if attendance already marked with leave reason today
        const attRes = await fetch("/api/attendance/today")
        if (attRes.ok) {
          const att = await attRes.json()
          if (att && att.presentDespiteLeave) {
            sessionStorage.setItem(sessionKey, "true")
            return
          }
        }
        setActiveLeaveInfo(matchingLeave)
        setActiveLeaveModalOpen(true)
      }
    } catch (e) {
      console.error("Failed to check active leave for today:", e)
    }
  }

  const handleActiveLeaveReasonSubmit = async (e) => {
    if (e) e.preventDefault()
    if (!activeLeaveReason.trim()) return
    setActiveLeaveSubmitting(true)
    try {
      const res = await fetch("/api/attendance/leave-present-reason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: activeLeaveReason })
      })
      if (res.ok) {
        const today = new Date().toISOString().slice(0, 10)
        sessionStorage.setItem(`leave_reason_submitted_${currentUser.id}_${today}`, "true")
        setActiveLeaveModalOpen(false)
        setActiveLeaveReason("")
      } else {
        const d = await res.json()
        alert(d.error || "Submission failed.")
      }
    } catch (err) {
      console.error("Reason submit error", err)
    } finally {
      setActiveLeaveSubmitting(false)
    }
  }

  const currentUserId = currentUser ? currentUser.id : ""

  const handleLoginSuccess = (user) => {
    sessionStorage.setItem("iitm_user", JSON.stringify(user))
    setCurrentUser(user)
    const initialView = (user.role === "trainee" || user.role === "intern") ? "learning" : "dashboard"
    setActiveView(initialView)
    sessionStorage.setItem("iitm_active_view", initialView)
    checkActiveLeaveForToday(user)
    window.location.href = "/" // Clean reload to clear lag
  }

  const handleLogout = async () => {
    try {
      await fetch("/api/logout", { method: "POST" })
    } catch (_) {}
    sessionStorage.removeItem("iitm_user")
    sessionStorage.removeItem("iitm_active_view")
    setCurrentUser(null)
    setActiveView("dashboard")
    window.location.href = "/" // Clean reload to clear lag
  }

  // Load instruments & users
  const loadInstruments = async () => {
    try {
      const res = await fetch("/api/instruments")
      if (res.ok) {
        const data = await res.json()
        setInstruments(data)
      } else if (res.status === 401 || res.status === 403) {
        // Session expired or stale sessionStorage — force re-login
        sessionStorage.removeItem("iitm_user")
        sessionStorage.removeItem("iitm_active_view")
        setCurrentUser(null)
      }
    } catch (err) {
      console.error("Failed to load instruments", err)
    }
  }

  const loadUsers = async () => {
    try {
      const res = await fetch("/api/users")
      if (res.ok) {
        const data = await res.json()
        setUsers(data)
      } else if (res.status === 401 || res.status === 403) {
        sessionStorage.removeItem("iitm_user")
        sessionStorage.removeItem("iitm_active_view")
        setCurrentUser(null)
      }
    } catch (err) {
      console.error("Failed to load users", err)
    }
  }

  const loadAll = () => {
    loadInstruments()
    loadPendingRequestsCount()
  }

  // Load initial data on mount
  useEffect(() => {
    if (currentUser) {
      loadUsers()
      loadInstruments()
      loadPendingRequestsCount()
      checkActiveLeaveForToday(currentUser)
    }
  }, [currentUser])

  // Sync socket listeners when active operator (currentUserId) changes
  useEffect(() => {
    if (!currentUser) return

    // Socket listeners
    socket.on("connect", () => {
      setSocketConnected(true)
    })

    socket.on("disconnect", () => {
      setSocketConnected(false)
    })

    socket.on("instruments", (data) => {
      setInstruments(data)
    })

    socket.on("insight", (data) => {
      try {
        if (!data) return
        if (data.toUserId && String(data.toUserId) !== String(currentUserId)) return
        if (data.items && Array.isArray(data.items)) {
          const lines = data.items.map(
            it => `${it.instrumentName}: ${it.insight || "<no previous insight>"}`
          )
          setInsightLines(lines)
          setInsightModalOpen(true)
        }
      } catch (err) {
        console.error("Error in insight socket listener", err)
      }
    })

    socket.on("bookings", () => {
      setRefreshBookingsKey(prev => prev + 1)
      loadPendingRequestsCount()
    })

    return () => {
      socket.off("connect")
      socket.off("disconnect")
      socket.off("instruments")
      socket.off("insight")
      socket.off("bookings")
    }
  }, [currentUserId, currentUser])

  // Toggle theme class on body
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }, [darkMode])

  if (!currentUser) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />
  }

  // Booking Excel sheet download helper
  // Uses fetch + blob approach to guarantee the .xlsx extension is preserved
  // regardless of how individual browsers handle Content-Disposition headers
  // on same-origin anchor clicks.
  const offerDownload = async (filePath) => {
    try {
      const fileName = filePath.split("/").pop() || "booking.xlsx"
      // Ensure the filename always ends with .xlsx
      const safeFileName = fileName.endsWith(".xlsx") ? fileName : fileName + ".xlsx"
      const res = await fetch(filePath, { credentials: "include" })
      if (!res.ok) {
        console.error("Download failed, server returned:", res.status)
        // Fallback: open the download URL directly in a new tab
        window.open(filePath, "_blank")
        return
      }
      const rawBlob = await res.blob()
      // Re-create blob with the explicit xlsx MIME type so the browser
      // doesn't misinterpret the binary payload as a generic octet-stream
      const xlsxMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      const blob = new Blob([rawBlob], { type: xlsxMime })
      const objectUrl = URL.createObjectURL(blob)

      // Detect if user is on iPhone / iPad / iOS Safari
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

      if (isIOS) {
        // iOS Safari workaround: navigate the current window to the blob URL to prompt a native download
        window.location.href = objectUrl;
      } else {
        const a = document.createElement("a")
        a.href = objectUrl
        a.download = safeFileName
        a.style.display = "none"
        document.body.appendChild(a)
        a.click()
        // Revoke the object URL and clean up the anchor after download starts
        setTimeout(() => {
          URL.revokeObjectURL(objectUrl)
          a.remove()
        }, 3000)
      }
    } catch (err) {
      console.error("offerDownload error:", err)
      // Last-resort fallback: direct navigation
      try { window.open(filePath, "_blank") } catch (_) { /* ignore */ }
    }
  }

  const renderCurrentView = () => {
    switch (activeView) {
      case "dashboard":
        return <DashboardView instruments={instruments} currentUser={currentUser} setActiveView={setActiveView} />
      case "inventory":
        return (
          <InventoryView
            instruments={instruments}
            searchTerm={searchTerm}
            currentUserRole={currentUser ? currentUser.role : "engineer"}
            loadAll={loadAll}
          />
        )
      case "booking":
        return (
          <BookingView
            instruments={instruments}
            searchTerm={searchTerm}
            currentUserId={currentUserId}
            currentUserRole={currentUser ? currentUser.role : "engineer"}
            refreshKey={refreshBookingsKey}
            loadAll={loadAll}
            offerDownload={offerDownload}
          />
        )
      case "calibration":
        return (
          <CalibrationView
            instruments={instruments}
            currentUserId={currentUserId}
            loadAll={loadAll}
          />
        )
      case "booking-requests":
        return <BookingRequestsView offerDownload={offerDownload} loadPendingRequestsCount={loadPendingRequestsCount} />
      case "user-management":
        return <UserManagementView currentUser={currentUser} offerDownload={offerDownload} />
      case "vendor-management":
        return <VendorManagementView currentUserRole={currentUser ? currentUser.role.toLowerCase() : "engineer"} />
      case "transaction":
        return <TransactionView currentUser={currentUser} offerDownload={offerDownload} refreshKey={refreshBookingsKey} />
      case "calendar":
        return <CalendarView refreshKey={refreshBookingsKey} />
      // ── HR / TASK / LEAVE MODULE VIEWS ──
      case "tasks":
        return <TaskManagementView currentUser={currentUser} />
      case "daily-reports":
        return <DailyReportView currentUser={currentUser} />
      case "my-leaves":
        return <MyLeavesView currentUser={currentUser} />
      case "leave-approval":
        return <LeaveApprovalView currentUser={currentUser} />
      case "leave-calendar":
        return canManageHR ? (
          <LeaveCalendarView currentUser={currentUser} />
        ) : (
          <DashboardView instruments={instruments} currentUser={currentUser} setActiveView={setActiveView} />
        )
      case "holidays":
        return <HolidayManagementView currentUser={currentUser} />
      case "attendance":
        return <AttendanceView currentUser={currentUser} />
      case "hr-dashboard":
        return <HRDashboardView currentUser={currentUser} />
      case "admin-settings":
        return <AdminSettingsView currentUser={currentUser} />
      case "learning":
        return <LearningView instruments={instruments} />
      default:
        return <DashboardView instruments={instruments} currentUser={currentUser} setActiveView={setActiveView} />
    }
  }

  const role = (currentUser ? currentUser.role : "engineer").toLowerCase()
  const isIntern = role === "intern" || role === "trainee"
  const isEngineer = role === "engineer"
  const isAuditor = role === "auditor"
  const isHR = role === "hr"
  const isAdmin = role === "admin"

  // 5-Tier RBAC Capabilities
  const canAccessInventory = !isIntern // engineer, auditor, hr, admin
  const canApproveBookings = isAuditor || isAdmin // auditor has authority to approve requests for components
  const canManageHR = isHR || isAdmin // HR & Admin have workforce management, attendance override & leave approvals
  const isSuperAdmin = isAdmin // admin has User Management & HR Settings

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-4 h-4" /> },

    // ── 1. WORK MANAGEMENT (TOP PRIORITY) ──
    { id: "__divider_work__", label: "Work Management", isDivider: true },
    { id: "tasks", label: "Task Management", icon: <CheckSquare className="w-4 h-4" /> },
    { id: "daily-reports", label: "Daily Reports", icon: <FileText className="w-4 h-4" /> },
    { id: "attendance", label: "Attendance", icon: <UserCheck className="w-4 h-4" /> },
    ...(canManageHR ? [
      { id: "hr-dashboard", label: "HR Dashboard", icon: <BarChart2 className="w-4 h-4" /> }
    ] : []),

    // ── 2. LEAVE MANAGEMENT (TOP PRIORITY) ──
    { id: "__divider_leave__", label: "Leave Management", isDivider: true },
    { id: "my-leaves", label: "My Leaves", icon: <Umbrella className="w-4 h-4" /> },
    ...(canManageHR ? [
      { id: "leave-approval", label: "Leave Approvals", icon: <Clock className="w-4 h-4" /> },
      { id: "leave-calendar", label: "Leave Calendar", icon: <CalendarRange className="w-4 h-4" /> }
    ] : []),
    { id: "holidays", label: "Holiday Calendar", icon: <CalendarCheck className="w-4 h-4" /> },

    // ── 3. ASSET & INVENTORY OPERATIONS ──
    ...(canAccessInventory ? [
      { id: "__divider_equipment__", label: "Equipment & Audit", isDivider: true },
      { id: "inventory", label: "Inventory", icon: <Boxes className="w-4 h-4" /> },
      { id: "booking", label: "Booking / Return", icon: <CalendarClock className="w-4 h-4" /> },
      ...(canApproveBookings ? [
        { id: "booking-requests", label: "Booking Requests", icon: <ShieldCheck className="w-4 h-4" /> }
      ] : []),
      { id: "vendor-management", label: "Vendor Management", icon: <Handshake className="w-4 h-4" /> },
      { id: "transaction", label: "Transactions", icon: <Layers className="w-4 h-4" /> },
      { id: "calendar", label: "Equipment Calendar", icon: <CalendarDays className="w-4 h-4" /> },
      { id: "calibration", label: "Calibration", icon: <Activity className="w-4 h-4" /> }
    ] : []),

    // ── 4. ADMINISTRATION ──
    ...(isSuperAdmin ? [
      { id: "__divider_admin__", label: "Administration", isDivider: true },
      { id: "user-management", label: "User Management", icon: <Users className="w-4 h-4" /> },
      { id: "admin-settings", label: "HR & Leave Settings", icon: <Settings className="w-4 h-4" /> }
    ] : []),

    // ── 5. LEARNING ──
    { id: "__divider_resources__", label: "Resources", isDivider: true },
    { id: "learning", label: "Learning Center", icon: <GraduationCap className="w-4 h-4" /> }
  ]

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-background font-sans text-foreground relative">
      {/* Mobile sidebar backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/45 lg:hidden transition-opacity cursor-pointer"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar navigation */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 border-r bg-card flex flex-col justify-between shrink-0 transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
        mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:flex"
      }`}>
        <div>
          {/* Brand header */}
          <div className="h-16 flex items-center justify-between px-4 border-b bg-muted/20 gap-2">
            <div className="flex items-center gap-1.5 shrink-0">
              <img src="https://lh3.googleusercontent.com/d/1Y1tT7mrE-ntA-cY5xpewNdIp3sGXxO6F" alt="IITM Logo" className="h-8 w-auto object-contain bg-white rounded p-0.5" />
              <img src="https://lh3.googleusercontent.com/d/1_h0FAF9gosStf26KKGPOqPBdGozZdPCr" alt="IEAC Logo" className="h-8 w-auto object-contain bg-white rounded p-0.5" />
            </div>
            <div className="flex flex-col text-right justify-center min-w-0">
              <div className="font-semibold text-xs leading-none text-foreground truncate">IITM IEAC</div>
              <div className="text-[9px] text-muted-foreground font-medium mt-0.5 truncate">Asset Management</div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-0.5 overflow-y-auto">
            {navItems.map(item => {
              // Section dividers
              if (item.isDivider) {
                return (
                  <div key={item.id} className="pt-4 pb-1">
                    <p className="px-3 text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">{item.label}</p>
                  </div>
                )
              }
              const active = activeView === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveView(item.id)
                    // Clear search only when leaving search-enabled views
                    if (item.id !== "inventory" && item.id !== "booking") setSearchTerm("")
                    setMobileMenuOpen(false) // Close mobile menu drawer on click
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${active
                      ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                >
                  {item.icon}
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.id === "booking-requests" && pendingRequestsCount > 0 && (
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 ring-4 ring-red-500/20 shrink-0" />
                  )}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t space-y-3 bg-muted/10">
          {/* Connection status */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 font-medium">
              <Wifi className={`w-3.5 h-3.5 ${socketConnected ? "text-emerald-500" : "text-muted-foreground/60"}`} />
              {socketConnected ? "Realtime sync" : "Sync offline"}
            </span>
            <span className="text-[10px] font-mono opacity-80">v2.0</span>
          </div>

          {/* Theme switcher */}
          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-xs font-medium text-muted-foreground">Theme</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-muted"
              onClick={() => setDarkMode(!darkMode)}
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </aside>

      {/* Main panel container */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top Header controls */}
        <header className="h-16 border-b bg-card flex items-center justify-between px-4 sm:px-6 shrink-0 gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* Hamburger menu button for small screens */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-9 w-9 shrink-0 text-muted-foreground hover:bg-muted"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>

            {(activeView === "inventory" || activeView === "booking") && (
              <div className="relative w-full max-w-xs sm:max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder={activeView === "booking" ? "Search booked or available instruments..." : "Search assets..."}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 w-full bg-muted/40 hover:bg-muted/65 focus:bg-background transition-all"
                />
              </div>
            )}
          </div>

          {/* Logged in User Profile & Logout */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-semibold text-foreground">
                {currentUser ? currentUser.name : "Guest"}
              </span>
              <span className="text-[10px] text-muted-foreground font-medium capitalize animate-pulse">
                {currentUser ? `${currentUser.role} Account` : ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={currentUser?.role === "admin" ? "success" : "secondary"} className="capitalize text-[10px] h-5 py-0 px-2">
                {currentUser?.role || "operator"}
              </Badge>
              <NotificationCenter />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                onClick={handleLogout}
                title="Logout"
              >
                <LogOut className="w-4.5 h-4.5" />
              </Button>
            </div>
          </div>
        </header>

        {/* View content panel */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-background/50">
          <div className="max-w-6xl mx-auto">
            {renderCurrentView()}
          </div>
        </main>
      </div>

      {/* Socket Insight notification Popup */}
      <Dialog open={insightModalOpen} onOpenChange={setInsightModalOpen}>
        <DialogContent>
          <DialogHeader className="flex flex-row items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary shrink-0 animate-bounce" />
            <DialogTitle>Recent Booking Insights</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            Previous operators left the following updates for the instruments you just booked:
          </DialogDescription>
          <div className="space-y-2 pt-2 text-sm bg-muted/40 p-4 rounded-lg border max-h-[220px] overflow-y-auto">
            {insightLines.map((line, idx) => (
              <div key={idx} className="border-b last:border-0 pb-1.5 last:pb-0 font-medium text-foreground">
                {line}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setInsightModalOpen(false)}>Acknowledge</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Active Leave Notice & Attendance Verification Popup */}
      <Dialog open={activeLeaveModalOpen} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="flex flex-row items-center gap-3">
            <div className="p-2.5 rounded-full bg-amber-100 text-amber-700 shrink-0">
              <Umbrella className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-amber-950">Active Leave Notice</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                You have an approved {activeLeaveInfo?.leaveTypeName || "leave"} scheduled for today ({new Date().toLocaleDateString()}).
              </DialogDescription>
            </div>
          </DialogHeader>
          <form onSubmit={handleActiveLeaveReasonSubmit} className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground">
                What is the reason for being present today? <span className="text-red-500">*</span>
              </label>
              <textarea
                value={activeLeaveReason}
                onChange={(e) => setActiveLeaveReason(e.target.value)}
                placeholder="e.g. Urgent energy audit client assignment, personal trip rescheduled, critical machine inspection..."
                className="w-full text-xs rounded-lg border bg-background p-3 focus:outline-none focus:ring-2 focus:ring-primary min-h-[90px]"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Submitting this reason will record your attendance as Present today and automatically alert the HR & Administration department.
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button type="submit" disabled={activeLeaveSubmitting || !activeLeaveReason.trim()} className="w-full font-semibold">
                {activeLeaveSubmitting ? "Logging Attendance..." : "Confirm Reason & Proceed to Work"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
