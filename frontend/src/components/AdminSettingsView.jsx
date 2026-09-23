import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Settings, Plus, Trash2, Edit, Save, ToggleLeft, ToggleRight, Calendar, Briefcase } from "lucide-react"

function LeaveTypeManager() {
  const [types, setTypes] = useState([])
  const [editing, setEditing] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const res = await fetch("/api/leave-types")
    if (res.ok) setTypes(await res.json())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const deleteType = async (id) => {
    if (!confirm("Delete this leave type?")) return
    await fetch(`/api/leave-types/${id}`, { method: "DELETE" })
    load()
  }

  const toggle = async (lt) => {
    await fetch(`/api/leave-types/${lt.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !lt.isActive })
    })
    load()
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold">Leave Types</h3>
        <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setShowCreate(true)}><Plus className="w-3 h-3" />Add</Button>
      </div>
      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}</div>
      ) : (
        <div className="space-y-2">
          {types.map(lt => (
            <div key={lt.id} className={`flex items-center justify-between rounded-lg border p-3 ${!lt.isActive ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: lt.color || "#64748b" }} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{lt.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">({lt.code})</span>
                    {lt.isPaid && <Badge className="text-[9px] h-4 px-1 bg-green-100 text-green-700">Paid</Badge>}
                    {lt.carryForward && <Badge className="text-[9px] h-4 px-1 bg-blue-100 text-blue-700">Carry Fwd</Badge>}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{lt.defaultDays} days/year</p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => toggle(lt)} className="p-1 rounded hover:bg-muted/50 transition-colors">
                  {lt.isActive
                    ? <ToggleRight className="w-5 h-5 text-primary" />
                    : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                </button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(lt)}><Edit className="w-3 h-3" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteType(lt.id)}><Trash2 className="w-3 h-3" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {(showCreate || editing) && (
        <LeaveTypeFormModal existing={editing} onClose={() => { setShowCreate(false); setEditing(null) }} onSaved={() => { setShowCreate(false); setEditing(null); load() }} />
      )}
    </div>
  )
}

function LeaveTypeFormModal({ existing, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: existing?.name || "",
    code: existing?.code || "",
    defaultDays: existing?.defaultDays ?? 12,
    isPaid: existing?.isPaid ?? true,
    carryForward: existing?.carryForward ?? false,
    color: existing?.color || "#3b82f6",
    description: existing?.description || ""
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!form.name || !form.code) { setError("Name and code required."); return }
    setSaving(true); setError("")
    try {
      const method = existing ? "PUT" : "POST"
      const url = existing ? `/api/leave-types/${existing.id}` : "/api/leave-types"
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, defaultDays: Number(form.defaultDays) }) })
      if (res.ok) onSaved()
      else { const d = await res.json(); setError(d.error || "Failed.") }
    } catch (_) { setError("Network error.") }
    setSaving(false)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{existing ? "Edit" : "Add"} Leave Type</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          {error && <div className="rounded bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Name *</label>
              <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Casual Leave" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Code *</label>
              <Input value={form.code} onChange={e => set("code", e.target.value.toUpperCase())} placeholder="CL" maxLength={6} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Days/Year</label>
              <Input type="number" value={form.defaultDays} onChange={e => set("defaultDays", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Color</label>
              <input type="color" value={form.color} onChange={e => set("color", e.target.value)} className="w-full h-9 rounded-md border cursor-pointer" />
            </div>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.isPaid} onChange={e => set("isPaid", e.target.checked)} className="rounded" />Paid Leave
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.carryForward} onChange={e => set("carryForward", e.target.checked)} className="rounded" />Carry Forward
            </label>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
            <Input value={form.description} onChange={e => set("description", e.target.value)} placeholder="Brief description..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving}>{saving ? "Saving..." : (existing ? "Update" : "Create")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HRPolicySettings() {
  const [settings, setSettings] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch("/api/hr-settings").then(r => r.ok ? r.json() : null).then(d => d && setSettings(d))
  }, [])

  const set = (k, v) => setSettings(p => ({ ...p, [k]: v }))

  const save = async () => {
    setSaving(true)
    const res = await fetch("/api/hr-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings)
    })
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 3000) }
    setSaving(false)
  }

  if (!settings) return <div className="h-40 bg-muted rounded-lg animate-pulse" />

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold">HR Policy Settings</h3>
        <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={save} disabled={saving}>
          <Save className="w-3 h-3" />{saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Work Start Time</label>
            <Input type="time" value={settings.workingHoursStart || "09:00"} onChange={e => set("workingHoursStart", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Work End Time</label>
            <Input type="time" value={settings.workingHoursEnd || "18:00"} onChange={e => set("workingHoursEnd", e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Max Consecutive Leave Days</label>
            <Input type="number" value={settings.maxConsecutiveLeave || 10} onChange={e => set("maxConsecutiveLeave", Number(e.target.value))} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Daily Report Deadline</label>
            <Input type="time" value={settings.dailyReportDeadlineTime || "19:00"} onChange={e => set("dailyReportDeadlineTime", e.target.value)} />
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Working Days</label>
            <div className="flex flex-wrap gap-2">
              {["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map(d => {
                const active = (settings.workingDays || []).includes(d)
                return (
                  <button key={d} onClick={() => {
                    const days = settings.workingDays || []
                    set("workingDays", active ? days.filter(x => x !== d) : [...days, d])
                  }} className={`px-2 py-1 rounded text-xs font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                    {d.slice(0, 3)}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border p-3">
            <input type="checkbox" id="carryforward" checked={settings.carryForwardLeave || false} onChange={e => set("carryForwardLeave", e.target.checked)} className="rounded" />
            <label htmlFor="carryforward" className="text-sm text-muted-foreground cursor-pointer">Enable leave carry forward globally</label>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AdminSettingsView({ currentUser }) {
  const [activeTab, setActiveTab] = useState("leave-types")

  const tabs = [
    { id: "leave-types", label: "Leave Types", icon: Calendar },
    { id: "hr-policy", label: "HR Policy", icon: Settings },
  ]

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Settings</h1>
        <p className="text-sm text-muted-foreground">Configure HR policies, leave types, and system settings</p>
      </div>

      <div className="flex gap-1 rounded-lg border bg-muted/30 p-1 w-fit">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-md transition-all ${activeTab === tab.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <Icon className="w-3.5 h-3.5" />{tab.label}
            </button>
          )
        })}
      </div>

      <Card>
        <CardContent className="p-6">
          {activeTab === "leave-types" && <LeaveTypeManager />}
          {activeTab === "hr-policy" && <HRPolicySettings />}
        </CardContent>
      </Card>
    </div>
  )
}
