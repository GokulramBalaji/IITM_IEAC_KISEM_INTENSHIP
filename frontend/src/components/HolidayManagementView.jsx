import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Calendar, Plus, Trash2, Edit, ChevronLeft, ChevronRight, Info } from "lucide-react"

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]

const TYPE_COLORS = {
  national: "bg-red-100 border-red-200 text-red-800 dark:bg-red-950/30",
  company: "bg-blue-100 border-blue-200 text-blue-800 dark:bg-blue-950/30",
  optional: "bg-amber-100 border-amber-200 text-amber-800 dark:bg-amber-950/30"
}

export default function HolidayManagementView({ currentUser }) {
  const [holidays, setHolidays] = useState([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(new Date().getMonth())
  const [year, setYear] = useState(new Date().getFullYear())
  const [showCreate, setShowCreate] = useState(false)
  const [editHol, setEditHol] = useState(null)
  const [hoveredDay, setHoveredDay] = useState(null)
  const role = (currentUser?.role || "").toLowerCase()
  const canManageHolidays = role === "admin" || role === "hr" || role === "manager"

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/holidays")
      if (res.ok) setHolidays(await res.json())
    } catch (_) {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const deleteHoliday = async (id) => {
    if (!confirm("Delete this holiday?")) return
    await fetch(`/api/holidays/${id}`, { method: "DELETE" })
    load()
  }

  // Calendar grid
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = Array(firstDay).fill(null).concat([...Array(daysInMonth)].map((_, i) => i + 1))
  const todayStr = new Date().toISOString().slice(0, 10)

  const holidayMap = {}
  holidays.forEach(h => { holidayMap[h.date] = h })

  const upcomingHolidays = holidays.filter(h => h.date >= todayStr).slice(0, 6)
  const monthHolidays = holidays.filter(h => {
    const d = new Date(h.date)
    return d.getFullYear() === year && d.getMonth() === month
  })

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Holiday Calendar</h1>
          <p className="text-sm text-muted-foreground">Company holiday schedule and national holidays</p>
        </div>
        {canManageHolidays && (
          <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus className="w-4 h-4" />Add Holiday
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{MONTHS[month]} {year}</CardTitle>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7"
                  onClick={() => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2"
                  onClick={() => { setMonth(new Date().getMonth()); setYear(new Date().getFullYear()) }}>Today</Button>
                <Button variant="ghost" size="icon" className="h-7 w-7"
                  onClick={() => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }}>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-2">
              {DAYS.map(d => (
                <div key={d} className={`text-center text-[10px] font-semibold py-1 ${d === "Sun" || d === "Sat" ? "text-muted-foreground/50" : "text-muted-foreground"}`}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                if (!day) return <div key={i} />
                const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                const hol = holidayMap[dateStr]
                const isToday = dateStr === todayStr
                const dayOfWeek = new Date(dateStr).getDay()
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

                return (
                  <div key={i} className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-xs transition-colors
                    ${isToday ? "bg-primary text-primary-foreground font-bold" : ""}
                    ${hol && !isToday ? TYPE_COLORS[hol.type] || TYPE_COLORS.company : ""}
                    ${isWeekend && !hol && !isToday ? "text-muted-foreground/40" : ""}
                    ${!isToday && !hol ? "hover:bg-muted/40" : ""}
                    cursor-default`}
                    onMouseEnter={() => hol && setHoveredDay(dateStr)}
                    onMouseLeave={() => setHoveredDay(null)}
                  >
                    <span className="font-medium">{day}</span>
                    {hol && <span className="w-1 h-1 rounded-full bg-current mt-0.5 opacity-70" />}
                    {hol && hoveredDay === dateStr && (
                      <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-10 bg-popover text-popover-foreground text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap border text-center">
                        {hol.name}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t text-[10px]">
              {Object.entries(TYPE_COLORS).map(([type, cls]) => (
                <span key={type} className={`flex items-center gap-1 px-2 py-1 rounded border ${cls} capitalize font-medium`}>{type}</span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* This month */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{MONTHS[month]} Holidays</CardTitle>
            </CardHeader>
            <CardContent>
              {monthHolidays.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">No holidays this month.</p>
              ) : (
                <div className="space-y-2">
                  {monthHolidays.map(h => (
                    <div key={h.id} className="flex items-start justify-between gap-2 rounded-lg border p-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{h.name}</p>
                        <p className="text-[10px] text-muted-foreground">{new Date(h.date + "T12:00:00").toLocaleDateString()}</p>
                        <Badge className={`${TYPE_COLORS[h.type]} text-[9px] h-3.5 px-1 mt-1`}>{h.type}</Badge>
                      </div>
                      {canManageHolidays && (
                        <div className="flex gap-0.5 shrink-0">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditHol(h)}><Edit className="w-3 h-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => deleteHoliday(h.id)}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Upcoming Holidays</CardTitle></CardHeader>
            <CardContent>
              {upcomingHolidays.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">No upcoming holidays.</p>
              ) : (
                <div className="space-y-2">
                  {upcomingHolidays.map(h => {
                    const daysAway = Math.ceil((new Date(h.date) - new Date()) / (1000 * 86400))
                    return (
                      <div key={h.id} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                        <div>
                          <p className="text-xs font-medium">{h.name}</p>
                          <p className="text-[10px] text-muted-foreground">{new Date(h.date + "T12:00:00").toLocaleDateString()}</p>
                        </div>
                        <span className="text-[10px] font-medium text-primary shrink-0">{daysAway === 0 ? "Today!" : `${daysAway}d`}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {(showCreate || editHol) && (
        <HolidayFormModal
          existing={editHol}
          onClose={() => { setShowCreate(false); setEditHol(null) }}
          onSaved={() => { setShowCreate(false); setEditHol(null); load() }}
        />
      )}
    </div>
  )
}

function HolidayFormModal({ existing, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: existing?.name || "",
    date: existing?.date || new Date().toISOString().slice(0, 10),
    type: existing?.type || "national",
    isOptional: existing?.isOptional || false,
    description: existing?.description || ""
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!form.name.trim() || !form.date) { setError("Name and date are required."); return }
    setSaving(true); setError("")
    try {
      const method = existing ? "PUT" : "POST"
      const url = existing ? `/api/holidays/${existing.id}` : "/api/holidays"
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      if (res.ok) onSaved()
      else { const d = await res.json(); setError(d.error || "Failed to save.") }
    } catch (_) { setError("Network error.") }
    setSaving(false)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Holiday" : "Add Holiday"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {error && <div className="rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Holiday Name *</label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g., Diwali" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Date *</label>
            <Input type="date" value={form.date} onChange={e => set("date", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
            <select value={form.type} onChange={e => set("type", e.target.value)}
              className="w-full text-sm rounded-md border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20">
              <option value="national">National</option>
              <option value="company">Company</option>
              <option value="optional">Optional</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="optional" checked={form.isOptional} onChange={e => set("isOptional", e.target.checked)} className="rounded" />
            <label htmlFor="optional" className="text-sm text-muted-foreground">Optional holiday (restricted)</label>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
            <Input value={form.description} onChange={e => set("description", e.target.value)} placeholder="e.g., National Holiday" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving}>{saving ? "Saving..." : (existing ? "Update" : "Add Holiday")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
