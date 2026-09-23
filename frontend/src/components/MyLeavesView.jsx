import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Calendar, Plus, AlertCircle, CheckCircle2, Clock, XCircle, Info, Umbrella } from "lucide-react"

const STATUS_CONFIG = {
  submitted: { label: "Pending", color: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
  approved: { label: "Approved", color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle2 },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
  cancelled: { label: "Cancelled", color: "bg-gray-100 text-gray-600 border-gray-200", icon: XCircle }
}

function ApplyLeaveModal({ onClose, onApplied }) {
  const [leaveTypes, setLeaveTypes] = useState([])
  const [form, setForm] = useState({
    leaveTypeId: "", fromDate: "", toDate: "",
    isHalfDay: false, reason: "", emergencyLeave: false, contactDuringLeave: ""
  })
  const [workingDays, setWorkingDays] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch("/api/leave-types")
      .then(r => r.ok ? r.json() : [])
      .then(types => {
        const activeTypes = Array.isArray(types) ? types.filter(t => t.isActive !== false) : []
        setLeaveTypes(activeTypes)
        if (activeTypes.length > 0 && !form.leaveTypeId) {
          setForm(p => ({ ...p, leaveTypeId: activeTypes[0].id }))
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (form.fromDate && form.toDate && form.toDate >= form.fromDate) {
      const diff = Math.ceil((new Date(form.toDate) - new Date(form.fromDate)) / (1000 * 86400)) + 1
      setWorkingDays(form.isHalfDay ? 0.5 : diff)
    } else {
      setWorkingDays(0)
    }
  }, [form.fromDate, form.toDate, form.isHalfDay])

  const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setError("") }

  const submit = async () => {
    if (!form.leaveTypeId) { setError("Please select a leave category."); return }
    if (!form.fromDate || !form.toDate) { setError("Please specify start and end dates."); return }
    if (form.toDate < form.fromDate) { setError("End date cannot be prior to start date."); return }
    if (!form.reason.trim()) { setError("Please provide the reason for leave."); return }

    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/leave-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      })
      if (res.ok) {
        onApplied()
      } else {
        const d = await res.json()
        setError(d.error || "Failed to submit leave request.")
      }
    } catch (_) {
      setError("Network connection failed.")
    } finally {
      setSaving(false)
    }
  }

  const selectedType = leaveTypes.find(lt => String(lt.id) === String(form.leaveTypeId))

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Umbrella className="w-5 h-5 text-primary" />
            Apply for Leave
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <div className="rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2 border border-destructive/20 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Leave Category *</label>
            <select
              value={form.leaveTypeId}
              onChange={e => set("leaveTypeId", e.target.value)}
              className="w-full text-sm rounded-md border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {leaveTypes.map(lt => (
                <option key={lt.id} value={lt.id}>{lt.name} ({lt.code})</option>
              ))}
            </select>
            {selectedType?.description && (
              <p className="text-[11px] text-muted-foreground mt-1">{selectedType.description}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">From Date *</label>
              <Input type="date" value={form.fromDate} onChange={e => set("fromDate", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">To Date *</label>
              <Input type="date" value={form.toDate} onChange={e => set("toDate", e.target.value)} min={form.fromDate} />
            </div>
          </div>

          {workingDays > 0 && (
            <div className="rounded-lg bg-muted/40 border p-3 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Duration</span>
              <span className="text-sm font-bold text-foreground">
                {workingDays} {workingDays === 1 ? "Day" : "Days"}
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer" onClick={() => set("isHalfDay", !form.isHalfDay)}>
            <input 
              type="checkbox" 
              id="halfday" 
              checked={form.isHalfDay} 
              onChange={e => set("isHalfDay", e.target.checked)} 
              className="rounded" 
            />
            <label htmlFor="halfday" className="text-xs font-medium text-foreground cursor-pointer">
              Half Day Leave (0.5 Day)
            </label>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Reason for Leave *</label>
            <textarea
              value={form.reason}
              onChange={e => set("reason", e.target.value)}
              className="w-full min-h-[90px] text-sm rounded-md border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              placeholder="State the purpose of your leave request..."
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Emergency Contact (Optional)</label>
            <Input
              value={form.contactDuringLeave}
              onChange={e => set("contactDuringLeave", e.target.value)}
              placeholder="Phone number or alternate email"
            />
          </div>

          <div className="flex items-center gap-2 rounded-lg border p-3 cursor-pointer" onClick={() => set("emergencyLeave", !form.emergencyLeave)}>
            <input 
              type="checkbox" 
              id="emergency" 
              checked={form.emergencyLeave} 
              onChange={e => set("emergencyLeave", e.target.checked)} 
              className="rounded" 
            />
            <label htmlFor="emergency" className="text-xs font-medium text-foreground cursor-pointer">
              Mark as Urgent / Emergency Leave
            </label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving}>
            {saving ? "Submitting..." : "Apply Leave"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function MyLeavesView({ currentUser }) {
  const [leaves, setLeaves] = useState([])
  const [loading, setLoading] = useState(true)
  const [showApply, setShowApply] = useState(false)
  const [cancelling, setCancelling] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/leave-requests")
      if (res.ok) {
        setLeaves(await res.json())
      }
    } catch (_) {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const cancelLeave = async (id) => {
    if (!confirm("Are you sure you want to cancel this leave application?")) return
    setCancelling(id)
    try {
      await fetch(`/api/leave-requests/${id}/cancel`, { method: "POST" })
      load()
    } catch (_) {}
    setCancelling(null)
  }

  const myLeaves = leaves.filter(l => String(l.userId) === String(currentUser?.id))

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">My Leaves</h1>
          <p className="text-sm text-muted-foreground">Submit leave applications and track approval statuses</p>
        </div>
        <Button size="sm" className="gap-1.5 cursor-pointer font-semibold shadow-sm" onClick={() => setShowApply(true)}>
          <Plus className="w-4 h-4" /> Apply Leave
        </Button>
      </div>

      {/* Leave Request History */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">My Leave Applications</CardTitle>
          <CardDescription className="text-xs">History of all your submitted leave requests</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 rounded-xl border bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : myLeaves.length === 0 ? (
            <div className="text-center py-12">
              <Umbrella className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">No leave applications found.</p>
              <p className="text-xs text-muted-foreground mt-1">Need time off? Click below to apply for leave.</p>
              <Button size="sm" className="mt-4 gap-1.5" onClick={() => setShowApply(true)}>
                <Plus className="w-4 h-4" /> Apply for Leave
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {myLeaves.map(lr => {
                const sc = STATUS_CONFIG[lr.status] || STATUS_CONFIG.submitted
                const StatusIcon = sc.icon
                const canCancel = lr.status === "submitted"

                return (
                  <div key={lr.id} className="rounded-xl border bg-card p-4 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                          style={{ backgroundColor: (lr.color || "#3b82f6") + "20" }}
                        >
                          <Calendar className="w-4 h-4" style={{ color: lr.color || "#3b82f6" }} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-foreground">
                              {lr.leaveTypeName || lr.leaveTypeCode || "General Leave"}
                            </span>
                            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${sc.color}`}>
                              <StatusIcon className="w-3 h-3" />
                              {sc.label}
                            </span>
                            {lr.emergencyLeave && (
                              <span className="text-[10px] text-red-600 font-medium bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                                Emergency
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {lr.fromDate} → {lr.toDate} · <strong>{lr.days} {lr.isHalfDay ? "half-day" : lr.days === 1 ? "day" : "days"}</strong>
                          </p>
                        </div>
                      </div>

                      {canCancel && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 cursor-pointer"
                          onClick={() => cancelLeave(lr.id)} 
                          disabled={cancelling === lr.id}
                        >
                          {cancelling === lr.id ? "Cancelling..." : "Cancel Application"}
                        </Button>
                      )}
                    </div>

                    {lr.reason && (
                      <p className="text-xs text-muted-foreground mt-3 pl-13 leading-relaxed bg-muted/20 p-2.5 rounded-lg border">
                        <span className="font-semibold text-foreground">Reason: </span>
                        {lr.reason}
                      </p>
                    )}

                    {lr.rejectionReason && (
                      <div className="mt-2.5 rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700 dark:bg-red-950/20 dark:border-red-800/40 dark:text-red-400">
                        <strong>Rejection Reason:</strong> {lr.rejectionReason}
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-3 text-[10px] text-muted-foreground border-t pt-2">
                      <span>Submitted on: {new Date(lr.createdAt).toLocaleDateString()}</span>
                      <span className="font-mono text-muted-foreground/60">{lr.id}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {showApply && (
        <ApplyLeaveModal 
          onClose={() => setShowApply(false)} 
          onApplied={() => { setShowApply(false); load() }} 
        />
      )}
    </div>
  )
}
