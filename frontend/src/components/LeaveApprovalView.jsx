import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { CheckCircle2, XCircle, Clock, User, Calendar, Eye, MessageSquare } from "lucide-react"

const STATUS_CONFIG = {
  submitted: { label: "Pending", color: "bg-amber-100 text-amber-700 border-amber-200" },
  approved: { label: "Approved", color: "bg-green-100 text-green-700 border-green-200" },
  rejected: { label: "Rejected", color: "bg-red-100 text-red-700 border-red-200" },
  cancelled: { label: "Cancelled", color: "bg-gray-100 text-gray-600 border-gray-200" }
}

function LeaveDetailModal({ lr, onClose, onAction }) {
  const [comment, setComment] = useState("")
  const [acting, setActing] = useState(false)

  const action = async (type) => {
    setActing(true)
    try {
      await fetch(`/api/leave-requests/${lr.id}/${type}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comments: comment })
      })
      onAction()
    } catch (_) {}
    setActing(false)
  }

  const sc = STATUS_CONFIG[lr.status] || STATUS_CONFIG.submitted

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Calendar className="w-4 h-4" />Leave Request Details</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className={`inline-flex items-center text-xs font-semibold px-2 py-1 rounded border ${sc.color}`}>{sc.label}</span>
            <span className="font-mono text-xs text-muted-foreground">{lr.id}</span>
            {lr.emergencyLeave && <span className="text-xs text-red-600 font-medium bg-red-50 border border-red-200 px-2 py-1 rounded">Emergency</span>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Employee", value: lr.employeeName },
              { label: "Leave Type", value: `${lr.leaveTypeName} (${lr.leaveTypeCode})` },
              { label: "From", value: lr.fromDate },
              { label: "To", value: lr.toDate },
              { label: "Days", value: `${lr.days} ${lr.isHalfDay ? "(Half Day)" : ""}` },
              { label: "Applied On", value: new Date(lr.createdAt).toLocaleDateString() },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border bg-muted/20 p-3">
                <p className="text-[10px] text-muted-foreground font-medium uppercase">{label}</p>
                <p className="text-sm font-medium mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          {lr.reason && (
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-[10px] text-muted-foreground font-medium uppercase mb-1">Reason</p>
              <p className="text-sm text-foreground/80">{lr.reason}</p>
            </div>
          )}

          {lr.contactDuringLeave && (
            <div className="rounded-lg border bg-muted/20 p-3">
              <p className="text-[10px] text-muted-foreground font-medium uppercase mb-1">Contact During Leave</p>
              <p className="text-sm">{lr.contactDuringLeave}</p>
            </div>
          )}

          {lr.approvals && lr.approvals.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Approval History</p>
              <div className="space-y-2">
                {lr.approvals.map(a => (
                  <div key={a.id} className={`rounded-lg border p-3 text-xs ${a.action === "approved" ? "border-green-200 bg-green-50 dark:bg-green-950/10" : "border-red-200 bg-red-50 dark:bg-red-950/10"}`}>
                    <div className="flex justify-between">
                      <span className="font-medium">{a.approverName}</span>
                      <span className="text-muted-foreground">{new Date(a.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className={`capitalize font-semibold mt-0.5 ${a.action === "approved" ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>{a.action}</p>
                    {a.comments && <p className="text-muted-foreground mt-1 italic">"{a.comments}"</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {lr.status === "submitted" && (
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <p className="text-xs font-semibold">Action Comments (Optional)</p>
              <textarea value={comment} onChange={e => setComment(e.target.value)}
                className="w-full min-h-[70px] text-sm rounded-md border bg-background px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                placeholder="Add comments for the employee..." />
              <div className="flex gap-2">
                <Button size="sm" className="gap-1.5 flex-1" onClick={() => action("approve")} disabled={acting}>
                  <CheckCircle2 className="w-3.5 h-3.5" />Approve
                </Button>
                <Button size="sm" variant="destructive" className="gap-1.5 flex-1" onClick={() => action("reject")} disabled={acting}>
                  <XCircle className="w-3.5 h-3.5" />Reject
                </Button>
              </div>
            </div>
          )}
        </div>
        <DialogFooter><Button variant="outline" size="sm" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function LeaveApprovalView({ currentUser }) {
  const [leaves, setLeaves] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState("submitted")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const [lr, ur] = await Promise.all([fetch("/api/leave-requests"), fetch("/api/users")])
      if (lr.ok) setLeaves(await lr.json())
      if (ur.ok) setUsers(await ur.json())
    } catch (_) {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = leaves.filter(l => {
    const matchStatus = filterStatus === "all" || l.status === filterStatus
    const matchSearch = !search || l.employeeName?.toLowerCase().includes(search.toLowerCase()) || l.id.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  const pending = leaves.filter(l => l.status === "submitted").length
  const approved = leaves.filter(l => l.status === "approved").length
  const rejected = leaves.filter(l => l.status === "rejected").length

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leave Approvals</h1>
        <p className="text-sm text-muted-foreground">Review and approve team leave requests</p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Pending Approval", value: pending, color: "border-l-amber-500", action: () => setFilterStatus("submitted") },
          { label: "Approved This Year", value: approved, color: "border-l-green-500", action: () => setFilterStatus("approved") },
          { label: "Rejected", value: rejected, color: "border-l-red-500", action: () => setFilterStatus("rejected") },
        ].map(({ label, value, color, action }) => (
          <Card key={label} className={`border-l-4 ${color} cursor-pointer hover:shadow-md transition-shadow`} onClick={action}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-medium">{label}</p>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <User className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or ID..." className="pl-9 h-8 text-sm" />
          </div>
          <div className="flex gap-1 rounded-lg border bg-muted/30 p-1">
            {[
              { id: "submitted", label: "Pending" },
              { id: "approved", label: "Approved" },
              { id: "rejected", label: "Rejected" },
              { id: "all", label: "All" }
            ].map(tab => (
              <button key={tab.id} onClick={() => setFilterStatus(tab.id)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${filterStatus === tab.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >{tab.label}</button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Leave list */}
      {loading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-xl border bg-muted animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <Calendar className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No {filterStatus !== "all" ? filterStatus : ""} leave requests.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(lr => {
            const sc = STATUS_CONFIG[lr.status] || STATUS_CONFIG.submitted
            const isOverlap = new Date(lr.fromDate) <= new Date() && new Date() <= new Date(lr.toDate)

            return (
              <div key={lr.id} className="rounded-xl border bg-card p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <span className="text-sm font-semibold text-primary">{(lr.employeeName || "?").charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{lr.employeeName}</span>
                        <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border ${sc.color}`}>{sc.label}</span>
                        {lr.emergencyLeave && <span className="text-[9px] text-red-600 font-bold bg-red-50 border border-red-200 px-1 py-0.5 rounded">URGENT</span>}
                        {isOverlap && lr.status === "approved" && <span className="text-[9px] text-blue-600 font-bold bg-blue-50 border border-blue-200 px-1 py-0.5 rounded">ON LEAVE</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {lr.leaveTypeName} · {lr.fromDate} → {lr.toDate} · {lr.days} {lr.days === 1 ? "day" : "days"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {lr.status === "submitted" && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-green-700 border-green-200 hover:bg-green-50"
                          onClick={async () => {
                            await fetch(`/api/leave-requests/${lr.id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
                            load()
                          }}>
                          <CheckCircle2 className="w-3 h-3" />Approve
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-700 border-red-200 hover:bg-red-50"
                          onClick={async () => {
                            await fetch(`/api/leave-requests/${lr.id}/reject`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
                            load()
                          }}>
                          <XCircle className="w-3 h-3" />Reject
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelected(lr)}>
                      <Eye className="w-3.5 h-3.5 mr-1" />Details
                    </Button>
                  </div>
                </div>
                {lr.reason && <p className="text-xs text-muted-foreground mt-2 leading-relaxed line-clamp-2 ml-13">{lr.reason}</p>}
                <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                  <span>Applied: {new Date(lr.createdAt).toLocaleDateString()}</span>
                  <span className="font-mono">{lr.id}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {selected && <LeaveDetailModal lr={selected} onClose={() => setSelected(null)} onAction={() => { setSelected(null); load() }} />}
    </div>
  )
}
