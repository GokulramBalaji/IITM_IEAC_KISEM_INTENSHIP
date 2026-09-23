import React, { useState, useEffect } from "react"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import {
  CheckSquare, Plus, Search, Filter, Clock, AlertTriangle, ChevronRight,
  Calendar, User, Tag, Briefcase, CheckCircle2, Circle, MoreHorizontal,
  Edit, Trash2, MessageSquare, Paperclip, ChevronDown
} from "lucide-react"

const PRIORITY_CONFIG = {
  low: { label: "Low", color: "bg-slate-100 text-slate-700 border-slate-200", dot: "bg-slate-400" },
  medium: { label: "Medium", color: "bg-blue-100 text-blue-700 border-blue-200", dot: "bg-blue-500" },
  high: { label: "High", color: "bg-orange-100 text-orange-700 border-orange-200", dot: "bg-orange-500" },
  critical: { label: "Critical", color: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500" }
}

const STATUS_CONFIG = {
  not_started: { label: "Not Started", color: "bg-gray-100 text-gray-600", icon: Circle },
  assigned: { label: "Assigned", color: "bg-blue-100 text-blue-700", icon: User },
  in_progress: { label: "In Progress", color: "bg-amber-100 text-amber-700", icon: Clock },
  on_hold: { label: "On Hold", color: "bg-orange-100 text-orange-700", icon: AlertTriangle },
  completed: { label: "Completed", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-600", icon: Circle }
}

function TaskCard({ task, onOpen, currentUser }) {
  const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium
  const status = STATUS_CONFIG[task.status] || STATUS_CONFIG.assigned
  const StatusIcon = status.icon
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "completed"

  return (
    <div
      className={`group rounded-xl border bg-card p-4 hover:shadow-md transition-all cursor-pointer ${isOverdue ? "border-red-200 bg-red-50/30 dark:border-red-900/30 dark:bg-red-950/10" : ""}`}
      onClick={() => onOpen(task)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${priority.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${priority.dot}`} />
              {priority.label}
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${status.color}`}>
              <StatusIcon className="w-2.5 h-2.5" />{status.label}
            </span>
          </div>
          <h3 className="font-semibold text-sm text-foreground leading-snug">{task.title}</h3>
          {task.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0 mt-1" />
      </div>
      {/* Progress bar */}
      {task.percentComplete > 0 && (
        <div className="mt-3">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>Progress</span><span>{task.percentComplete}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${task.percentComplete}%` }} />
          </div>
        </div>
      )}
      <div className="flex items-center gap-3 mt-3 text-[11px] text-muted-foreground">
        {task.assigneeName && (
          <span className="flex items-center gap-1"><User className="w-3 h-3" />{task.assigneeName}</span>
        )}
        {task.dueDate && (
          <span className={`flex items-center gap-1 ${isOverdue ? "text-red-500 font-medium" : ""}`}>
            <Calendar className="w-3 h-3" />{new Date(task.dueDate).toLocaleDateString()}
            {isOverdue && " (Overdue)"}
          </span>
        )}
        {task.id && <span className="font-mono text-[10px] opacity-60">{task.id}</span>}
      </div>
    </div>
  )
}

function TaskDetailModal({ task, onClose, currentUser, onRefresh }) {
  const [subtasks, setSubtasks] = useState(task.subtasks || [])
  const [comments, setComments] = useState(task.comments || [])
  const [attachments, setAttachments] = useState(task.attachments || [])
  const [newComment, setNewComment] = useState("")
  const [newSubtask, setNewSubtask] = useState("")
  const [activeTab, setActiveTab] = useState("overview")
  const [saving, setSaving] = useState(false)
  const [statusEdit, setStatusEdit] = useState(task.status)
  const [progressEdit, setProgressEdit] = useState(task.percentComplete || 0)
  const [hoursEdit, setHoursEdit] = useState(task.actualHours || "")

  const role = (currentUser?.role || "").toLowerCase()
  const canEdit = role === "admin" || role === "manager" || String(task.assignedTo) === String(currentUser?.id)

  const saveProgress = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: statusEdit, percentComplete: Number(progressEdit), actualHours: hoursEdit ? Number(hoursEdit) : undefined })
      })
      if (res.ok) onRefresh()
    } catch (_) {}
    setSaving(false)
  }

  const addComment = async () => {
    if (!newComment.trim()) return
    try {
      const res = await fetch(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newComment })
      })
      if (res.ok) {
        const c = await res.json()
        setComments(prev => [...prev, c])
        setNewComment("")
      }
    } catch (_) {}
  }

  const addSubtask = async () => {
    if (!newSubtask.trim()) return
    try {
      const res = await fetch(`/api/tasks/${task.id}/subtasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newSubtask })
      })
      if (res.ok) {
        const s = await res.json()
        setSubtasks(prev => [...prev, s])
        setNewSubtask("")
      }
    } catch (_) {}
  }

  const toggleSubtask = async (st) => {
    try {
      const res = await fetch(`/api/tasks/${task.id}/subtasks/${st.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !st.completed })
      })
      if (res.ok) setSubtasks(prev => prev.map(s => s.id === st.id ? { ...s, completed: !s.completed } : s))
    } catch (_) {}
  }

  const tabs = ["overview", "subtasks", "comments", "attachments"]
  const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "completed"

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded border ${priority.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${priority.dot}`} />{priority.label}
            </span>
            <span className="text-xs text-muted-foreground font-mono">{task.id}</span>
          </div>
          <DialogTitle className="text-lg leading-snug mt-1">{task.title}</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b shrink-0 px-6 gap-1">
          {tabs.map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-3 py-2 text-xs font-medium capitalize border-b-2 transition-colors ${activeTab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >{t}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              {task.description && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Description</h4>
                  <p className="text-sm text-foreground/80 leading-relaxed">{task.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Assigned To", value: task.assigneeName },
                  { label: "Assigned By", value: task.assignerName },
                  { label: "Due Date", value: task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "—" },
                  { label: "Estimated Hours", value: task.estimatedHours ? `${task.estimatedHours}h` : "—" },
                  { label: "Project", value: task.project || "—" },
                  { label: "Department", value: task.department || "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase">{label}</p>
                    <p className="text-sm font-medium text-foreground mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
              {isOverdue && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/20 dark:border-red-800/40 dark:text-red-400">
                  <AlertTriangle className="w-4 h-4 shrink-0" />This task is overdue!
                </div>
              )}
              {canEdit && (
                <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Update Progress</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
                      <select value={statusEdit} onChange={e => setStatusEdit(e.target.value)}
                        className="w-full text-xs rounded-md border bg-background px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20">
                        {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">% Complete</label>
                      <Input type="number" min="0" max="100" value={progressEdit} onChange={e => setProgressEdit(e.target.value)} className="h-8 text-xs" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Actual Hours</label>
                      <Input type="number" value={hoursEdit} onChange={e => setHoursEdit(e.target.value)} className="h-8 text-xs" placeholder="hrs" />
                    </div>
                  </div>
                  <Button size="sm" onClick={saveProgress} disabled={saving} className="h-7 text-xs">
                    {saving ? "Saving..." : "Save Update"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* SUBTASKS */}
          {activeTab === "subtasks" && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground mb-2">
                {subtasks.filter(s => s.completed).length}/{subtasks.length} completed
              </div>
              {subtasks.map(st => (
                <div key={st.id} className="flex items-center gap-3 rounded-lg border bg-card p-3 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => toggleSubtask(st)}>
                  {st.completed
                    ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    : <Circle className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <span className={`text-sm flex-1 ${st.completed ? "line-through text-muted-foreground" : "text-foreground"}`}>{st.title}</span>
                </div>
              ))}
              {subtasks.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No subtasks yet.</p>}
              {canEdit && (
                <div className="flex gap-2 mt-4">
                  <Input value={newSubtask} onChange={e => setNewSubtask(e.target.value)} placeholder="Add subtask..." className="h-8 text-sm"
                    onKeyDown={e => e.key === "Enter" && addSubtask()} />
                  <Button size="sm" onClick={addSubtask} className="h-8 shrink-0"><Plus className="w-3.5 h-3.5" /></Button>
                </div>
              )}
            </div>
          )}

          {/* COMMENTS */}
          {activeTab === "comments" && (
            <div className="space-y-3">
              {comments.map(c => (
                <div key={c.id} className="rounded-lg border bg-card p-3">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-semibold text-foreground">{c.authorName}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(c.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-foreground/80 mt-1">{c.text}</p>
                </div>
              ))}
              {comments.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No comments yet.</p>}
              <div className="flex gap-2 mt-4">
                <Input value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Add a comment..." className="h-8 text-sm"
                  onKeyDown={e => e.key === "Enter" && addComment()} />
                <Button size="sm" onClick={addComment} className="h-8 shrink-0">Post</Button>
              </div>
            </div>
          )}

          {/* ATTACHMENTS */}
          {activeTab === "attachments" && (
            <div className="space-y-3">
              {attachments.map(a => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{a.filename}</p>
                      <p className="text-[10px] text-muted-foreground">{a.uploadedByName} · {new Date(a.uploadedAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <a href={a.url} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="h-7 text-xs shrink-0">Download</Button>
                  </a>
                </div>
              ))}
              {attachments.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No attachments.</p>}
              {canEdit && (
                <div className="mt-4">
                  <label className="cursor-pointer">
                    <div className="rounded-lg border-2 border-dashed border-muted p-4 text-center hover:border-primary/40 transition-colors">
                      <Paperclip className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
                      <p className="text-xs text-muted-foreground">Click to upload file (PDF, XLSX, DOCX, PNG, JPG — max 10MB)</p>
                    </div>
                    <input type="file" className="hidden" accept=".pdf,.xlsx,.xls,.docx,.csv,.jpg,.jpeg,.png,.gif,.webp"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const formData = new FormData()
                        formData.append("file", file)
                        try {
                          const res = await fetch(`/api/tasks/${task.id}/attachments`, { method: "POST", body: formData })
                          if (res.ok) { const att = await res.json(); setAttachments(prev => [...prev, att]) }
                        } catch (_) {}
                      }} />
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreateTaskModal({ onClose, onCreated, currentUser, users }) {
  const [form, setForm] = useState({ title: "", description: "", assignedTo: "", priority: "medium", dueDate: "", estimatedHours: "", project: "", department: "", category: "" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const role = (currentUser?.role || "").toLowerCase()

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const submit = async () => {
    if (!form.title.trim()) { setError("Task title is required."); return }
    setSaving(true); setError("")
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : undefined })
      })
      if (res.ok) { onCreated(); onClose() }
      else { const d = await res.json(); setError(d.error || "Failed to create task.") }
    } catch (_) { setError("Network error.") }
    setSaving(false)
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="w-4 h-4" />Create New Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {error && <div className="rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2 border border-destructive/20">{error}</div>}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Task Title *</label>
            <Input value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g., Complete electrical measurement analysis" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
            <textarea value={form.description} onChange={e => set("description", e.target.value)}
              className="w-full min-h-[80px] text-sm rounded-md border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" placeholder="Task details..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(role === "admin" || role === "manager") && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Assign To</label>
                <select value={form.assignedTo} onChange={e => set("assignedTo", e.target.value)}
                  className="w-full text-sm rounded-md border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20">
                  <option value="">Self</option>
                  {users.filter(u => u.role !== "trainee").map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Priority</label>
              <select value={form.priority} onChange={e => set("priority", e.target.value)}
                className="w-full text-sm rounded-md border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20">
                <option value="low">Low</option><option value="medium">Medium</option>
                <option value="high">High</option><option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Due Date</label>
              <Input type="date" value={form.dueDate} onChange={e => set("dueDate", e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Est. Hours</label>
              <Input type="number" value={form.estimatedHours} onChange={e => set("estimatedHours", e.target.value)} placeholder="hrs" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Project / Audit</label>
              <Input value={form.project} onChange={e => set("project", e.target.value)} placeholder="e.g., ABC Textile Audit" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
              <Input value={form.category} onChange={e => set("category", e.target.value)} placeholder="e.g., Energy Audit" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving}>{saving ? "Creating..." : "Create Task"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function TaskManagementView({ currentUser }) {
  const [tasks, setTasks] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filterStatus, setFilterStatus] = useState("all")
  const [filterPriority, setFilterPriority] = useState("all")
  const [activeTab, setActiveTab] = useState("my")
  const [selectedTask, setSelectedTask] = useState(null)
  const [showCreate, setShowCreate] = useState(false)

  const role = (currentUser?.role || "").toLowerCase()
  const canCreate = role === "admin" || role === "manager" || role === "engineer"

  const load = async () => {
    setLoading(true)
    try {
      const [tr, ur] = await Promise.all([fetch("/api/tasks"), fetch("/api/users")])
      if (tr.ok) setTasks(await tr.json())
      if (ur.ok) setUsers(await ur.json())
    } catch (_) {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const myTasks = tasks.filter(t => String(t.assignedTo) === String(currentUser?.id))
  const teamTasks = tasks.filter(t => String(t.assignedBy) === String(currentUser?.id) && String(t.assignedTo) !== String(currentUser?.id))
  const displayTasks = activeTab === "my" ? myTasks : activeTab === "team" ? teamTasks : tasks

  const filtered = displayTasks.filter(t => {
    const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase()) || (t.assigneeName || "").toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === "all" || t.status === filterStatus
    const matchPriority = filterPriority === "all" || t.priority === filterPriority
    return matchSearch && matchStatus && matchPriority
  })

  const overdue = filtered.filter(t => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== "completed").length
  const completed = filtered.filter(t => t.status === "completed").length
  const inProgress = filtered.filter(t => t.status === "in_progress").length

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Task Management</h1>
          <p className="text-sm text-muted-foreground">Manage and track your work assignments</p>
        </div>
        {canCreate && (
          <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5 shrink-0">
            <Plus className="w-4 h-4" />New Task
          </Button>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: filtered.length, color: "border-l-primary", icon: CheckSquare },
          { label: "In Progress", value: inProgress, color: "border-l-amber-500", icon: Clock },
          { label: "Completed", value: completed, color: "border-l-green-500", icon: CheckCircle2 },
          { label: "Overdue", value: overdue, color: "border-l-red-500", icon: AlertTriangle },
        ].map(({ label, value, color, icon: Icon }) => (
          <Card key={label} className={`border-l-4 ${color}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">{label}</p>
                  <p className="text-2xl font-bold">{value}</p>
                </div>
                <Icon className="w-5 h-5 text-muted-foreground/40" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs + Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Tabs */}
            <div className="flex gap-1 rounded-lg border bg-muted/30 p-1 shrink-0">
              {[
                { id: "my", label: `My Tasks (${myTasks.length})` },
                ...(role === "admin" || role === "manager" ? [{ id: "team", label: `Team (${teamTasks.length})` }] : []),
                ...(role === "admin" ? [{ id: "all", label: `All (${tasks.length})` }] : [])
              ].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${activeTab === tab.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >{tab.label}</button>
              ))}
            </div>
            <div className="flex gap-2 flex-1">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks..." className="pl-9 h-8 text-sm" />
              </div>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                className="text-xs rounded-md border bg-background px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/20 h-8">
                <option value="all">All Status</option>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
                className="text-xs rounded-md border bg-background px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/20 h-8">
                <option value="all">All Priority</option>
                {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Task list */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-32 rounded-xl border bg-muted animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-muted/50 py-16 text-center">
          <CheckSquare className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No tasks found</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            {canCreate ? 'Click "New Task" to create your first task.' : 'No tasks assigned to you yet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(task => (
            <TaskCard key={task.id} task={task} onOpen={setSelectedTask} currentUser={currentUser} />
          ))}
        </div>
      )}

      {selectedTask && (
        <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)} currentUser={currentUser} onRefresh={() => { load(); setSelectedTask(null) }} />
      )}
      {showCreate && <CreateTaskModal onClose={() => setShowCreate(false)} onCreated={load} currentUser={currentUser} users={users} />}
    </div>
  )
}
