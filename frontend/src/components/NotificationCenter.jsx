import React, { useState, useEffect, useRef } from "react"
import { Bell, X, Check, CheckCheck, AlertCircle, Briefcase, Calendar, ClipboardList } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const TYPE_ICON = {
  task_assigned: <Briefcase className="w-3.5 h-3.5 text-blue-500" />,
  task_update: <ClipboardList className="w-3.5 h-3.5 text-purple-500" />,
  task_completed: <Check className="w-3.5 h-3.5 text-green-500" />,
  leave_applied: <Calendar className="w-3.5 h-3.5 text-amber-500" />,
  leave_approved: <Check className="w-3.5 h-3.5 text-green-500" />,
  leave_rejected: <X className="w-3.5 h-3.5 text-red-500" />,
  leave_cancelled: <X className="w-3.5 h-3.5 text-red-500" />,
  default: <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />
}

function timeAgo(ts) {
  if (!ts) return ""
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(false)
  const ref = useRef(null)

  const unread = notifications.filter(n => !n.read).length

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/notifications")
      if (res.ok) setNotifications(await res.json())
    } catch (_) {}
    setLoading(false)
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const markRead = async (id) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PUT" })
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    } catch (_) {}
  }

  const markAllRead = async () => {
    try {
      await fetch("/api/notifications/read-all", { method: "PUT" })
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    } catch (_) {}
  }

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 relative text-muted-foreground hover:text-foreground"
        onClick={() => { setOpen(!open); if (!open) load() }}
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-10 w-80 max-h-[420px] rounded-xl border bg-card shadow-xl z-[200] flex flex-col overflow-hidden animate-in fade-in-0 slide-in-from-top-2 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/20">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">Notifications</span>
              {unread > 0 && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{unread} new</Badge>}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-muted-foreground hover:text-primary" onClick={markAllRead}>
                  <CheckCheck className="w-3 h-3 mr-1" />Mark all read
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {loading && notifications.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading...</div>
            )}
            {!loading && notifications.length === 0 && (
              <div className="px-4 py-10 text-center">
                <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
              </div>
            )}
            {notifications.map(n => (
              <div
                key={n.id}
                className={`flex gap-3 px-4 py-3 border-b last:border-0 cursor-pointer transition-colors ${n.read ? "hover:bg-muted/30" : "bg-primary/5 hover:bg-primary/8"}`}
                onClick={() => !n.read && markRead(n.id)}
              >
                <div className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                  {TYPE_ICON[n.type] || TYPE_ICON.default}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-xs font-semibold leading-tight ${n.read ? "text-muted-foreground" : "text-foreground"}`}>{n.title}</p>
                    {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 mt-1" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">{n.message}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
