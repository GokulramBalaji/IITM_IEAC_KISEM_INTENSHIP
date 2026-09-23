import React, { useState, useEffect } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table"
import { Check, X, ShieldQuestion, Calendar, User, Info, Layers } from "lucide-react"

/**
 * BookingRequestsView — Admin only
 *
 * The API (/api/booking-requests) returns requests already grouped:
 *  - single requests  → { requestId: bookingId, type: "single", instruments: [one item], ... }
 *  - bulk requests    → { requestId: bulkGroupId, type: "bulk",  instruments: [many items], ... }
 *
 * Both approve and deny accept either a bookingId or a bulkGroupId — the backend
 * decides the correct path automatically.
 */
export default function BookingRequestsView({ offerDownload, loadPendingRequestsCount }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const fetchRequests = async () => {
    try {
      const res = await fetch("/api/booking-requests")
      if (res.ok) {
        const data = await res.json()
        setRequests(data)
      }
    } catch (err) {
      console.error("Failed to fetch booking requests", err)
      setError("Failed to fetch requests from server.")
    }
  }

  useEffect(() => { fetchRequests() }, [])

  const handleApprove = async (requestId) => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/booking-requests/${requestId}/approve`, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        if (data.sheet) offerDownload(data.sheet)   // auto-download XLSX for admin
        fetchRequests()
        if (loadPendingRequestsCount) loadPendingRequestsCount()
      } else {
        setError(data.error || "Approval failed.")
      }
    } catch (err) {
      console.error("Approve error", err)
      setError("Server error during approval.")
    } finally {
      setLoading(false)
    }
  }

  const handleDeny = async (requestId) => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/booking-requests/${requestId}/deny`, { method: "POST" })
      if (res.ok) {
        fetchRequests()
        if (loadPendingRequestsCount) loadPendingRequestsCount()
      } else {
        const data = await res.json()
        setError(data.error || "Deny failed.")
      }
    } catch (err) {
      console.error("Deny error", err)
      setError("Server error during deny.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Booking Requests</h1>
        <p className="text-muted-foreground">
          Review, approve, or deny checkout requests submitted by engineers.
          Bulk requests appear as a single row — approve once to generate one combined XLSX.
        </p>
      </div>

      {error && (
        <div className="p-3 text-sm font-semibold text-destructive bg-destructive/10 border border-destructive/20 rounded-lg">
          {error}
        </div>
      )}

      <Card className="shadow-sm">
        <CardHeader className="border-b">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <ShieldQuestion className="w-5 h-5 text-primary" />
            Pending Requests ({requests.length})
          </CardTitle>
          <CardDescription>
            Approving a request generates the official Excel log and authorises the checkout.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[700px] sm:min-w-full">
              <TableHeader>
                <TableRow>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Instrument(s)</TableHead>
                  <TableHead>Requested On</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => (
                  <TableRow key={req.requestId} className="hover:bg-accent/30 align-top">
                    {/* Engineer info */}
                    <TableCell className="py-3">
                      <div className="font-semibold text-foreground flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-muted-foreground" />
                        {req.userName}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">{req.userEmail}</div>
                    </TableCell>

                    {/* Instrument(s) — show list for bulk */}
                    <TableCell className="py-3 max-w-[240px]">
                      {req.type === "bulk" ? (
                        <div>
                          <div className="flex items-center gap-1 text-xs font-semibold text-primary mb-1">
                            <Layers className="w-3.5 h-3.5" />
                            Bulk — {req.instruments.length} instruments
                          </div>
                          <ul className="space-y-0.5">
                            {req.instruments.map((inst) => (
                              <li key={inst.id} className="text-[11px] text-muted-foreground leading-snug">
                                <span className="font-medium text-foreground">{inst.name}</span>
                                {" "}
                                <span className="font-mono">({inst.serial})</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <div>
                          <div className="font-semibold text-foreground">{req.instruments[0]?.name}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {req.instruments[0]?.model} ({req.instruments[0]?.serial})
                          </div>
                        </div>
                      )}
                    </TableCell>

                    {/* Dates */}
                    <TableCell className="py-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground/60" />
                        {new Date(req.startDate).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-muted-foreground/60" />
                        {new Date(req.dueDate).toLocaleDateString()}
                      </div>
                    </TableCell>

                    {/* Remarks */}
                    <TableCell className="py-3 max-w-[160px] truncate text-xs font-medium text-muted-foreground" title={req.remarks}>
                      {req.remarks ? (
                        <span className="flex items-center gap-1">
                          <Info className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                          {req.remarks}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40 italic">No notes</span>
                      )}
                    </TableCell>

                    {/* Actions — use requestId (bulkGroupId OR bookingId) */}
                    <TableCell className="py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1 font-semibold cursor-pointer"
                          onClick={() => handleApprove(req.requestId)}
                          disabled={loading}
                        >
                          <Check className="w-4 h-4" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="flex items-center gap-1 font-semibold cursor-pointer"
                          onClick={() => handleDeny(req.requestId)}
                          disabled={loading}
                        >
                          <X className="w-4 h-4" />
                          Deny
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {requests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No pending booking requests.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
