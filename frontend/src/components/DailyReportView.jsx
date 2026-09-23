import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { FileText, Plus, CheckCircle2, Clock, AlertTriangle, ChevronRight, Eye } from "lucide-react"

const STATUS_COLOR = {
  submitted: "bg-blue-100 text-blue-700",
  reviewed: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  returned: "bg-red-100 text-red-700"
}

function ReportForm({ existing, tasks, onSave, onCancel }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    date: existing?.date || today,
    tasksWorkedOn: existing?.tasksWorkedOn || [],
    workCompleted: existing?.workCompleted || "",
    workInProgress: existing?.workInProgress || "",
    blockers: existing?.blockers || "",
    hoursWorked: existing?.hoursWorked || "",
    achievements: existing?.achievements || "",
    planNextDay: existing?.planNextDay || "",
    additionalComments: existing?.additionalComments || ""
  })
  const [taskInput, setTaskInput] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const addTask = () => {
    if (!taskInput.trim()) return
    set("tasksWorkedOn", [...form.tasksWorkedOn, taskInput.trim()])
    setTaskInput("")
  }

  const submit = async () => {
    if (!form.workCompleted.trim()) { setError("Please describe work completed."); return }
    setSaving(true); setError("")
    try {
      const method = existing ? "PUT" : "POST"
      const url = existing ? `/api/daily-reports/${existing.id}` : "/api/daily-reports"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      })
      if (res.ok) onSave()
      else { const d = await res.json(); setError(d.error || "Failed to save report.") }
    } catch (_) { setError("Network error.") }
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2 border border-destructive/20">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Date *</label>
          <Input type="date" value={form.date} onChange={e => set("date", e.target.value)} max={today} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Hours Worked</label>
          <Input type="number" step="0.5" value={form.hoursWorked} onChange={e => set("hoursWorked", e.target.value)} placeholder="e.g., 8.5" />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Tasks Worked On</label>
        <div className="flex gap-2 mb-2">
          <Input value={taskInput} onChange={e => setTaskInput(e.target.value)} placeholder="Add task or task ID..."
            className="text-sm" onKeyDown={e => e.key === "Enter" && addTask()} />
          <Button size="sm" variant="outline" onClick={addTask} className="shrink-0">Add</Button>
        </div>
        {form.tasksWorkedOn.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {form.tasksWorkedOn.map((t, i) => (
              <span key={i} className="flex items-center gap-1 text-xs bg-muted px-2 py-1 rounded-full">
                {t}
                <button onClick={() => set("tasksWorkedOn", form.tasksWorkedOn.filter((_, j) => j !== i))} className="hover:text-destructive ml-0.5">×</button>
              </span>
            ))}
          </div>
        )}
      </div>
      {[
        { k: "workCompleted", label: "Work Completed Today *", placeholder: "Describe what you accomplished today..." },
        { k: "workInProgress", label: "Work In Progress", placeholder: "Ongoing work to continue tomorrow..." },
        { k: "blockers", label: "Problems / Blockers", placeholder: "Any issues, blockers, or challenges faced..." },
        { k: "achievements", label: "Achievements / Highlights", placeholder: "Key achievements or milestones..." },
        { k: "planNextDay", label: "Plan for Next Working Day", placeholder: "What will you work on tomorrow..." },
        { k: "additionalComments", label: "Additional Comments", placeholder: "Any other notes..." }
      ].map(({ k, label, placeholder }) => (
        <div key={k}>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
          <textarea value={form[k]} onChange={e => set(k, e.target.value)}
            className="w-full min-h-[80px] text-sm rounded-md border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            placeholder={placeholder} />
        </div>
      ))}
      <div className="flex gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={saving}>{saving ? "Submitting..." : (existing ? "Update Report" : "Submit Report")}</Button>
      </div>
    </div>
  )
}

function ReportDetailModal({ report, onClose, currentUser }) {
  const [managerComment, setManagerComment] = useState("")
  const [saving, setSaving] = useState(false)
  const role = (currentUser?.role || "").toLowerCase()
  const canReview = role === "admin" || role === "manager"

  const submitReview = async (status) => {
    setSaving(true)
    try {
      await fetch(`/api/daily-reports/${report.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, managerComment, reviewedBy: currentUser.id, reviewedAt: new Date().toISOString() })
      })
      onClose()
    } catch (_) {}
    setSaving(false)
  }

  const fields = [
    ["Work Completed", report.workCompleted],
    ["Work In Progress", report.workInProgress],
    ["Blockers", report.blockers],
    ["Achievements", report.achievements],
    ["Plan for Next Day", report.planNextDay],
    ["Additional Comments", report.additionalComments],
  ].filter(([, v]) => v)

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4" />Daily Work Report
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span><strong>Date:</strong> {new Date(report.date).toLocaleDateString()}</span>
            <span><strong>Employee:</strong> {report.employeeName}</span>
            {report.hoursWorked && <span><strong>Hours:</strong> {report.hoursWorked}h</span>}
            <Badge className={`${STATUS_COLOR[report.status]} text-[10px]`}>{report.status}</Badge>
          </div>
          {report.tasksWorkedOn?.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Tasks Worked On</h4>
              <div className="flex flex-wrap gap-1.5">
                {report.tasksWorkedOn.map((t, i) => <span key={i} className="text-xs bg-muted px-2 py-1 rounded-full">{t}</span>)}
              </div>
            </div>
          )}
          {fields.map(([label, value]) => (
            <div key={label} className="rounded-lg border bg-muted/20 p-3">
              <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{label}</h4>
              <p className="text-sm text-foreground/80 whitespace-pre-wrap">{value}</p>
            </div>
          ))}
          {report.managerComment && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <h4 className="text-[10px] font-semibold uppercase tracking-wide text-primary mb-1">Manager Comments</h4>
              <p className="text-sm text-foreground/80">{report.managerComment}</p>
            </div>
          )}
          {canReview && report.status === "submitted" && (
            <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
              <h4 className="text-xs font-semibold">Manager Review</h4>
              <textarea value={managerComment} onChange={e => setManagerComment(e.target.value)}
                className="w-full min-h-[80px] text-sm rounded-md border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                placeholder="Add your review comments..." />
              <div className="flex gap-2">
                <Button size="sm" className="gap-1.5" onClick={() => submitReview("reviewed")} disabled={saving}>
                  <CheckCircle2 className="w-3.5 h-3.5" />Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => submitReview("returned")} disabled={saving}>Return for Correction</Button>
              </div>
            </div>
          )}
        </div>
        <DialogFooter><Button variant="outline" size="sm" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function DailyReportView({ currentUser }) {
  const [reports, setReports] = useState([])
  const [tasks, setTasks] = useState([])
  const [todayReport, setTodayReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedReport, setSelectedReport] = useState(null)
  const today = new Date().toISOString().slice(0, 10)
  const role = (currentUser?.role || "").toLowerCase()

  const load = async () => {
    setLoading(true)
    try {
      const [rr, tr, tr2] = await Promise.all([
        fetch("/api/daily-reports"),
        fetch("/api/daily-reports/today"),
        fetch("/api/tasks")
      ])
      if (rr.ok) setReports(await rr.json())
      if (tr.ok) setTodayReport(await tr.json())
      if (tr2.ok) setTasks(await tr2.json())
    } catch (_) {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const myReports = reports.filter(r => String(r.userId) === String(currentUser?.id))
  const teamReports = reports.filter(r => String(r.userId) !== String(currentUser?.id))
  const displayReports = (role === "admin" || role === "manager") ? teamReports : myReports

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Daily Work Report</h1>
          <p className="text-sm text-muted-foreground">Submit and track your daily work updates</p>
        </div>
      </div>

      {/* Today's status */}
      <Card className={`border-l-4 ${todayReport ? (todayReport.status === "reviewed" ? "border-l-green-500" : "border-l-amber-500") : "border-l-red-500"}`}>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {todayReport ? (
              <><CheckCircle2 className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-sm font-semibold">Today's report submitted</p>
                <p className="text-xs text-muted-foreground">{new Date(todayReport.submittedAt).toLocaleString()} · {todayReport.hoursWorked || 0}h worked</p>
              </div></>
            ) : (
              <><AlertTriangle className="w-5 h-5 text-amber-500" />
              <div>
                <p className="text-sm font-semibold">Daily report not submitted</p>
                <p className="text-xs text-muted-foreground">Submit your work update for today</p>
              </div></>
            )}
          </div>
          {!todayReport ? (
            <Button size="sm" className="gap-1.5" onClick={() => setShowForm(true)}>
              <Plus className="w-3.5 h-3.5" />Submit Report
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setSelectedReport(todayReport)}><Eye className="w-3.5 h-3.5 mr-1.5" />View</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form */}
      {showForm && !todayReport && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4" />Daily Work Report — {today}</CardTitle>
          </CardHeader>
          <CardContent>
            <ReportForm tasks={tasks} onSave={() => { setShowForm(false); load() }} onCancel={() => setShowForm(false)} />
          </CardContent>
        </Card>
      )}

      {/* Reports list */}
      {(role === "admin" || role === "manager") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team Reports</CardTitle>
            <CardDescription>Daily work updates from your team</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}</div>
            ) : displayReports.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">No reports submitted yet.</div>
            ) : (
              <div className="space-y-2">
                {displayReports.slice(0, 20).map(r => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg border bg-card p-3 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedReport(r)}>
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{r.employeeName || "Unknown"}</span>
                          <Badge className={`${STATUS_COLOR[r.status]} text-[10px] h-4 px-1.5`}>{r.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{new Date(r.date).toLocaleDateString()} · {r.hoursWorked || 0}h</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* My History */}
      {myReports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">My Report History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {myReports.slice(0, 10).map(r => (
                <div key={r.id} className="flex items-center justify-between rounded-lg border bg-card p-3 hover:bg-muted/30 cursor-pointer"
                  onClick={() => setSelectedReport(r)}>
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{new Date(r.date).toLocaleDateString()}</span>
                        <Badge className={`${STATUS_COLOR[r.status]} text-[10px] h-4 px-1.5`}>{r.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{r.hoursWorked || 0}h worked</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {selectedReport && <ReportDetailModal report={selectedReport} onClose={() => { setSelectedReport(null); load() }} currentUser={currentUser} />}
    </div>
  )
}
