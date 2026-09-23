import React, { useState, useEffect } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Download, Trash2, Layers } from "lucide-react"

export default function TransactionView({ currentUser, offerDownload, refreshKey }) {
  const [bookings, setBookings] = useState([])
  const [deleteConfirmKey, setDeleteConfirmKey] = useState(null)

  const loadBookings = async () => {
    try {
      const res = await fetch("/api/bookings", { credentials: "include" })
      if (!res.ok) return
      const data = await res.json()
      const rows = currentUser && currentUser.role !== "admin"
        ? data.filter(b => String(b.userId) === String(currentUser.id))
        : data
      setBookings(rows.sort((a, b) => new Date(b.startDate) - new Date(a.startDate)))
    } catch (err) {
      console.error("Failed to load transactions", err)
    }
  }

  useEffect(() => {
    loadBookings()
  }, [currentUser, refreshKey])

  const handleDeleteHistory = async (key, isBulk) => {
    if (deleteConfirmKey !== key) {
      setDeleteConfirmKey(key)
      return
    }

    try {
      const endpoint = isBulk ? `/api/bookings/group/${key}` : `/api/bookings/${key}`
      const res = await fetch(endpoint, { method: 'DELETE', credentials: 'include' })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Failed to delete transaction.')
        return
      }
      setDeleteConfirmKey(null)
      loadBookings()
    } catch (err) {
      console.error('Transaction delete error', err)
      alert('Unable to delete booking transaction.')
    }
  }

  const groups = {}
  const order = []
  for (const b of bookings) {
    const key = b.bulkGroupId || b.id
    if (!groups[key]) {
      groups[key] = []
      order.push(key)
    }
    groups[key].push(b)
  }

  const rows = order.map(key => {
    const group = groups[key]
    const first = group[0]
    const isBulk = !!first.bulkGroupId
    const sheetUrl = group.find(b => b.sheetUrl)?.sheetUrl || null
    return { key, isBulk, bookings: group, first, sheetUrl }
  })

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Transaction History</h1>
        <p className="text-muted-foreground">View the full list of booking and return records in one place.</p>
      </div>

      <Card className="shadow-sm border-l-4 border-l-primary">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            {currentUser && currentUser.role === "admin" ? "All Transaction Records" : "My Transaction Records"}
          </CardTitle>
          <CardDescription>All booking, pre-booking, and return records are shown here for audit and review.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[700px] sm:min-w-full">
              <TableHeader>
                <TableRow>
                  <TableHead>Instrument(s)</TableHead>
                  {currentUser && currentUser.role === "admin" && <TableHead>Booked By</TableHead>}
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ key, isBulk, bookings, first, sheetUrl }) => {
                  const status = first.status || "approved"
                  const start = new Date(first.startDate).toLocaleDateString()
                  const due = new Date(first.dueDate).toLocaleDateString()
                  return (
                    <TableRow key={key} className="hover:bg-accent/20 align-top">
                      <TableCell className="font-semibold text-foreground">
                        {isBulk ? (
                          <div>
                            <div className="flex items-center gap-1 text-xs font-semibold text-primary mb-1">
                              <Layers className="w-3.5 h-3.5" />
                              Bulk — {bookings.length} instruments
                            </div>
                            <div className="grid gap-2">
                              {bookings.map(b => (
                                <div key={b.id} className="flex items-center gap-2 rounded-lg border bg-muted/20 p-2 text-[11px] text-muted-foreground">
                                  <span className="font-medium text-foreground truncate">{b.instrumentName}</span>
                                  <span className="font-mono">({b.instrumentSerial})</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="h-10 w-10 rounded-xl overflow-hidden bg-muted flex items-center justify-center border">
                              {first.instrumentImage ? (
                                <img src={first.instrumentImage} alt={first.instrumentName} className="h-full w-full object-cover" />
                              ) : (
                                <span className="text-[10px] text-muted-foreground">No image</span>
                              )}
                            </div>
                            <div>
                              <div>{first.instrumentName}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">
                                {first.instrumentModel} ({first.instrumentSerial})
                              </div>
                            </div>
                          </div>
                        )}
                      </TableCell>
                      {currentUser && currentUser.role === "admin" && (
                        <TableCell className="text-sm font-medium">{first.userName || "N/A"}</TableCell>
                      )}
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {start} – {due}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            first.returnedDate ? "secondary"
                              : status === "approved" ? "success"
                                : status === "pending" ? "warning"
                                  : "destructive"
                          }
                          className="capitalize text-[10px]"
                        >
                          {first.returnedDate ? "Returned" : status === "pending" ? "Pending Approval" : status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-xs text-muted-foreground" title={first.remarks}>
                        {first.remarks || <span className="text-muted-foreground/30 italic">No notes</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col gap-2 items-end">
                          {status === "approved" && sheetUrl ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 flex items-center gap-1.5 text-primary hover:text-primary font-semibold border-primary/20 hover:border-primary/50 hover:bg-primary/5 cursor-pointer"
                              onClick={() => offerDownload(sheetUrl)}
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>XLSX</span>
                            </Button>
                          ) : status === "pending" ? (
                            <span className="text-[11px] text-muted-foreground/60 italic font-medium">Awaiting Approval</span>
                          ) : status === "denied" ? (
                            <span className="text-[11px] text-destructive/70 italic font-medium">Denied</span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/40 italic">Not available</span>
                          )}
                          {currentUser && currentUser.role === 'admin' && (
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant={deleteConfirmKey === key ? 'destructive' : 'ghost'}
                                className="h-8 px-3 text-[11px] font-semibold"
                                onClick={() => handleDeleteHistory(key, isBulk)}
                              >
                                {deleteConfirmKey === key ? 'Confirm Delete' : <><Trash2 className="w-3.5 h-3.5 mr-1" /> Delete</>}
                              </Button>
                              {deleteConfirmKey === key && (
                                <Button size="sm" variant="outline" className="h-8 px-3 text-[11px]" onClick={() => setDeleteConfirmKey(null)}>
                                  Cancel
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={currentUser && currentUser.role === "admin" ? 6 : 5} className="text-center py-6 text-muted-foreground">
                      No transaction records available.
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
