import React, { useState, useEffect } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table"
import { Info, Download, ArrowUpDown, CheckCircle, XCircle, FileSpreadsheet, Layers, Trash2, CheckCircle2, AlertCircle, X, PackageCheck, Undo2 } from "lucide-react"

export default function BookingView({ instruments, searchTerm, currentUserId, currentUserRole, refreshKey, loadAll, offerDownload }) {
  const [selectedIds, setSelectedIds] = useState([])
  const [myBookings, setMyBookings] = useState([])
  const [deleteConfirmKey, setDeleteConfirmKey] = useState(null)

  const loadMyBookings = async () => {
    try {
      const res = await fetch("/api/bookings", { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        const filtered = currentUserRole === "admin"
          ? data
          : data.filter(b => String(b.userId) === String(currentUserId))
        const sorted = filtered.sort((a, b) => new Date(b.startDate) - new Date(a.startDate))
        setMyBookings(sorted)
      }
    } catch (err) {
      console.error("Failed to load bookings", err)
    }
  }

  useEffect(() => {
    loadMyBookings()
  }, [currentUserId, currentUserRole, instruments, refreshKey])

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
      loadAll()
      loadMyBookings()
    } catch (err) {
      console.error('History delete error', err)
      alert('Unable to delete booking transaction.')
    }
  }
  
  // Notification State
  const [notification, setNotification] = useState(null)
  const [notifVisible, setNotifVisible] = useState(false)
  
  const showNotification = (message, type = "success", title = null) => {
    setNotification({ message, type, title: title || (type === 'success' ? 'Success' : 'Error') })
    setNotifVisible(true)
    setTimeout(() => {
      setNotifVisible(false)
      setTimeout(() => setNotification(null), 400)
    }, 4500)
  }

  // Modals Open State
  const [bookModalOpen, setBookModalOpen] = useState(false)
  const [returnModalOpen, setReturnModalOpen] = useState(false)
  const [bulkBookModalOpen, setBulkBookModalOpen] = useState(false)
  const [bulkPreBookModalOpen, setBulkPreBookModalOpen] = useState(false)
  const [bulkReturnModalOpen, setBulkReturnModalOpen] = useState(false)
  
  // Single Row Target State
  const [targetInstrument, setTargetInstrument] = useState(null)

  // Form Fields State
  const [bookDays, setBookDays] = useState("7")
  const [bookRemarks, setBookRemarks] = useState("")
  const [returnRemarks, setReturnRemarks] = useState("")
  const [returnInsight, setReturnInsight] = useState("")
  
  // Pre-booking date state (for single and bulk pre-book)
  const [isPreBookMode, setIsPreBookMode] = useState(false)
  const [useCustomDates, setCustomDates] = useState(false)
  const [bulkUseCustomDates, setBulkUseCustomDates] = useState(false)
  const [preBookStartDate, setPreBookStartDate] = useState("")
  const [preBookEndDate, setPreBookEndDate] = useState("")
  const [bulkPreBookStartDate, setBulkPreBookStartDate] = useState("")
  const [bulkPreBookEndDate, setBulkPreBookEndDate] = useState("")
  const [bulkPreBookRemarks, setBulkPreBookRemarks] = useState("")

  // Bulk Return Extra States
  const [bulkReturnRemarks, setBulkReturnRemarks] = useState("")
  const [addPerInstrumentNotes, setAddPerInstrumentNotes] = useState(false)
  const [perInstrumentNotes, setPerInstrumentNotes] = useState({}) // { [id]: "" }

  // Compute today's date string for min attribute on date pickers
  const todayStr = new Date().toISOString().split("T")[0]

  const isDueSoon = (dateStr) => {
    if (!dateStr) return false
    const dueMs = new Date(dateStr) - new Date()
    return dueMs < 7 * 24 * 3600 * 1000
  }

  const filteredInstruments = instruments.filter(it => {
    const term = (searchTerm || "").toLowerCase()
    return (
      it.name?.toLowerCase().includes(term) ||
      it.model?.toLowerCase().includes(term) ||
      it.serial?.toLowerCase().includes(term) ||
      it.category?.toLowerCase().includes(term) ||
      it.status?.toLowerCase().includes(term)
    )
  })

  const handleSelectAll = () => {
    if (selectedIds.length === filteredInstruments.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredInstruments.map(i => i.id))
    }
  }

  const handleSelectRow = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  // Individual Booking / Pre-booking
  const openBookModal = (it) => {
    const prebook = it.status !== "available"
    setTargetInstrument(it)
    setIsPreBookMode(prebook)
    setCustomDates(prebook)
    setBookDays("7")
    setBookRemarks("")
    // Default dates for pre-booking: tomorrow onward for 7 days
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const nextWeek = new Date(tomorrow)
    nextWeek.setDate(nextWeek.getDate() + 7)
    setPreBookStartDate(tomorrow.toISOString().split("T")[0])
    setPreBookEndDate(nextWeek.toISOString().split("T")[0])
    setBookModalOpen(true)
  }

  const handleBookSubmit = async (e) => {
    e.preventDefault()
    if (!targetInstrument) return

    // Validate dates if custom dates are used
    if (useCustomDates) {
      if (!preBookStartDate || !preBookEndDate) {
        alert("Please select both a start and end date.")
        return
      }
      if (new Date(preBookEndDate) <= new Date(preBookStartDate)) {
        alert("End date must be after start date.")
        return
      }
    }

    try {
      const body = {
        userId: currentUserId,
        instrumentId: targetInstrument.id,
        remarks: bookRemarks
      }
      if (useCustomDates) {
        body.startDate = new Date(preBookStartDate).toISOString()
        body.endDate = new Date(preBookEndDate + "T23:59:59").toISOString()
      } else {
        body.days = Number(bookDays) || 7
      }

      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (res.ok) {
        setBookModalOpen(false)
        showNotification("Your booking request has been submitted and is pending admin approval.", "success", "📋 Booking Request Sent")
        if (data && data.sheet) {
          offerDownload(data.sheet)
        }
        loadAll()
      } else {
        showNotification(data.error || "Failed to book instrument.", "error", "Booking Failed")
      }
    } catch (err) {
      console.error("Booking error", err)
    }
  }

  // Individual Return
  const openReturnModal = (it) => {
    setTargetInstrument(it)
    setReturnRemarks("")
    setReturnInsight("")
    setReturnModalOpen(true)
  }

  const handleReturnSubmit = async (e) => {
    e.preventDefault()
    if (!targetInstrument) return

    try {
      // 1. Submit return
      const res = await fetch("/api/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instrumentId: targetInstrument.id,
          remarks: returnRemarks
        })
      })
      
      // 2. Submit insight if provided
      if (res.ok && returnInsight) {
        await fetch("/api/instrument/insight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instrumentId: targetInstrument.id,
            insight: returnInsight
          })
        })
      }

      if (res.ok) {
        setReturnModalOpen(false)
        showNotification("The instrument has been returned successfully. Thank you!", "success", "✅ Return Confirmed")
        loadAll()
      } else {
        const data = await res.json()
        showNotification(data.error || "Failed to return instrument.", "error", "Return Failed")
      }
    } catch (err) {
      console.error("Return error", err)
    }
  }

  // Bulk Booking (available instruments only)
  const openBulkBookModal = () => {
    const ids = selectedIds.filter(id => {
      const inst = instruments.find(i => i.id === id)
      return inst && inst.status === "available"
    })
    if (!ids.length) {
      alert("Select at least one available instrument for bulk booking.")
      return
    }
    setBookDays("7")
    setBookRemarks("")
    setBulkBookModalOpen(true)
  }

  const handleBulkBookSubmit = async (e) => {
    e.preventDefault()
    const ids = selectedIds.filter(id => {
      const inst = instruments.find(i => i.id === id)
      return inst && inst.status === "available"
    })

    try {
      const res = await fetch("/api/book/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUserId,
          instrumentIds: ids,
          days: Number(bookDays) || 7,
          remarks: bookRemarks
        })
      })
      const data = await res.json()
      if (res.ok) {
        setBulkBookModalOpen(false)
        setSelectedIds([])
        showNotification("Bulk booking request submitted! Pending admin approval.", "success", "📋 Bulk Booking Sent")
        if (data && data.sheet) {
          offerDownload(data.sheet)
        }
        loadAll()
      } else {
        showNotification("Failed to submit bulk booking. Please try again.", "error", "Bulk Booking Failed")
      }
    } catch (err) {
      console.error("Bulk booking error", err)
    }
  }

  // Bulk Pre-booking (non-available instruments)
  const openBulkPreBookModal = () => {
    const ids = selectedIds.filter(id => {
      const inst = instruments.find(i => i.id === id)
      return inst && inst.status !== "available"
    })
    if (!ids.length) {
      alert("Select at least one booked or requested instrument to pre-book.")
      return
    }
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const nextWeek = new Date(tomorrow)
    nextWeek.setDate(nextWeek.getDate() + 7)
    setBulkPreBookStartDate(tomorrow.toISOString().split("T")[0])
    setBulkPreBookEndDate(nextWeek.toISOString().split("T")[0])
    setBulkPreBookRemarks("")
    setBulkPreBookModalOpen(true)
  }

  const handleBulkPreBookSubmit = async (e) => {
    e.preventDefault()
    if (!bulkPreBookStartDate || !bulkPreBookEndDate) {
      alert("Please select both start and end dates.")
      return
    }
    if (new Date(bulkPreBookEndDate) <= new Date(bulkPreBookStartDate)) {
      alert("End date must be after start date.")
      return
    }
    const ids = selectedIds.filter(id => {
      const inst = instruments.find(i => i.id === id)
      return inst && inst.status !== "available"
    })

    try {
      const res = await fetch("/api/book/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUserId,
          instrumentIds: ids,
          startDate: new Date(bulkPreBookStartDate).toISOString(),
          endDate: new Date(bulkPreBookEndDate + "T23:59:59").toISOString(),
          remarks: bulkPreBookRemarks
        })
      })
      const data = await res.json()
      if (res.ok) {
        setBulkPreBookModalOpen(false)
        setSelectedIds([])
        showNotification("Pre-booking request submitted! Instruments are queued for when they become available.", "success", "⏳ Pre-Booking Sent")
        if (data && data.sheet) {
          offerDownload(data.sheet)
        }
        loadAll()
      } else {
        showNotification(data.error || "Failed to submit pre-booking.", "error", "Pre-Booking Failed")
      }
    } catch (err) {
      console.error("Bulk pre-book error", err)
    }
  }

  // Bulk Return
  const openBulkReturnModal = () => {
    const ids = selectedIds.filter(id => {
      const inst = instruments.find(i => i.id === id)
      return inst && inst.status === "booked"
    })
    if (!ids.length) {
      alert("Select at least one booked instrument to return.")
      return
    }
    setBulkReturnRemarks("")
    setAddPerInstrumentNotes(false)
    setPerInstrumentNotes({})
    setBulkReturnModalOpen(true)
  }

  const handleBulkReturnSubmit = async (e) => {
    e.preventDefault()
    const ids = selectedIds.filter(id => {
      const inst = instruments.find(i => i.id === id)
      return inst && inst.status === "booked"
    })

    try {
      const res = await fetch("/api/return/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instrumentIds: ids,
          remarks: bulkReturnRemarks
        })
      })

      if (res.ok && addPerInstrumentNotes) {
        for (const id of ids) {
          const insight = perInstrumentNotes[id]
          if (!insight) continue
          await fetch("/api/instrument/insight", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ instrumentId: id, insight })
          })
        }
      }

      if (res.ok) {
        setBulkReturnModalOpen(false)
        setSelectedIds([])
        showNotification("All selected instruments returned successfully!", "success", "✅ Bulk Return Confirmed")
        loadAll()
      } else {
        showNotification("Failed to process bulk return. Please try again.", "error", "Bulk Return Failed")
      }
    } catch (err) {
      console.error("Bulk return error", err)
    }
  }

  const handlePerInstrumentNoteChange = (id, text) => {
    setPerInstrumentNotes(prev => ({ ...prev, [id]: text }))
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Premium Toast Notification */}
      {notification && (
        <div
          className="fixed top-5 right-5 z-[9999] w-80 pointer-events-auto"
          style={{
            transform: notifVisible ? 'translateX(0)' : 'translateX(110%)',
            opacity: notifVisible ? 1 : 0,
            transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease'
          }}
        >
          <div className={`relative overflow-hidden rounded-xl border shadow-2xl ${
            notification.type === 'error'
              ? 'bg-red-50 dark:bg-red-950/60 border-red-200 dark:border-red-800'
              : 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800'
          }`}>
            {/* Progress bar */}
            <div
              className={`absolute top-0 left-0 h-1 ${
                notification.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'
              }`}
              style={{ animation: 'notif-shrink 4.5s linear forwards' }}
            />
            <div className="flex items-start gap-3 p-4 pr-10">
              <div className={`mt-0.5 flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
                notification.type === 'error'
                  ? 'bg-red-100 dark:bg-red-900/50'
                  : 'bg-emerald-100 dark:bg-emerald-900/50'
              }`}>
                {notification.type === 'error'
                  ? <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  : <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold ${
                  notification.type === 'error' ? 'text-red-800 dark:text-red-200' : 'text-emerald-800 dark:text-emerald-200'
                }`}>{notification.title}</p>
                <p className={`text-xs mt-0.5 leading-snug ${
                  notification.type === 'error' ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-300'
                }`}>{notification.message}</p>
              </div>
            </div>
            <button
              onClick={() => { setNotifVisible(false); setTimeout(() => setNotification(null), 400); }}
              className={`absolute top-3 right-3 p-0.5 rounded-md opacity-60 hover:opacity-100 transition-opacity ${
                notification.type === 'error' ? 'text-red-600' : 'text-emerald-600'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      <style>{`@keyframes notif-shrink { from { width: 100%; } to { width: 0%; } }`}</style>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Booking & Return</h1>
        <p className="text-muted-foreground">Check out instruments or log return procedures and notes.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between pb-4 space-y-2 md:space-y-0 gap-4 border-b">
          <div className="space-y-1">
            <CardTitle className="text-lg">Checkout Controls</CardTitle>
            <CardDescription>{selectedIds.length} instruments selected</CardDescription>
          </div>
          {/* Bulk Action Buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              {selectedIds.length === instruments.length ? "Deselect All" : "Select All"}
            </Button>
            <Button size="sm" onClick={openBulkBookModal} disabled={selectedIds.length === 0}>
              Bulk Book
            </Button>
            <Button size="sm" variant="secondary" onClick={openBulkPreBookModal} disabled={selectedIds.length === 0}>
              Bulk Pre-book
            </Button>
            <Button size="sm" variant="outline" onClick={openBulkReturnModal} disabled={selectedIds.length === 0}>
              Bulk Return
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-3">
            {filteredInstruments.map(it => {
              const isSelected = selectedIds.includes(it.id)
              const imageUrl = Array.isArray(it.productImages) && it.productImages[0]
              return (
                <div 
                  key={it.id} 
                  className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 border rounded-lg transition-all gap-4 ${
                    isSelected ? "bg-primary/5 border-primary/40 shadow-sm" : "hover:bg-accent/40"
                  }`}
                >
                  <div className="flex items-start gap-3 w-full sm:w-auto">
                    <Checkbox 
                      checked={isSelected} 
                      onChange={() => handleSelectRow(it.id)} 
                    />
                    {imageUrl ? (
                      <img src={imageUrl} alt={it.name} className="h-14 w-14 rounded-xl object-cover border" />
                    ) : (
                      <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center text-xs text-muted-foreground">No image</div>
                    )}
                    <div className="space-y-1 min-w-0">
                      <div className="font-semibold text-sm truncate max-w-[280px] sm:max-w-md md:max-w-lg" title={`${it.name} ${it.model}`}>
                        {it.name} {it.model} <span className="font-mono text-xs text-muted-foreground">({it.serial})</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge 
                          variant={it.status === "available" ? "success" : it.status === "requested" ? "secondary" : "warning"}
                          className="text-[10px] py-0 px-2"
                        >
                          {it.status}
                        </Badge>
                        
                        {isDueSoon(it.nextCalibrationDate) && (
                          <Badge variant="destructive" className="text-[10px] py-0 px-2 font-semibold animate-pulse">
                            Calibration Due
                          </Badge>
                        )}
                        
                        {/* Live active booking details */}
                        {it.status === "booked" && it.bookedBy && (
                          <span className="text-xs text-amber-600 bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10 font-medium">
                            Booked by <strong className="text-foreground">{it.bookedBy}</strong> until {it.nextAvailableDate ? new Date(it.nextAvailableDate).toLocaleDateString() : "N/A"}
                          </span>
                        )}

                        {/* Live pre-bookings queue count */}
                        {it.futureBookings && it.futureBookings.length > 0 && (
                          <span className="text-xs text-indigo-600 bg-indigo-500/5 px-2 py-0.5 rounded border border-indigo-500/10 font-medium">
                            Queue: {it.futureBookings.length} pre-booking(s)
                          </span>
                        )}

                        {it.nextBooking && (
                          <span className="text-xs text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-medium">
                            Next {it.nextBooking.status === 'approved' ? 'pre-booking' : 'request'}:
                            {' '}{new Date(it.nextBooking.startDate).toLocaleDateString()}–{new Date(it.nextBooking.dueDate).toLocaleDateString()} by <strong>{it.nextBooking.userName}</strong>
                          </span>
                        )}

                        {it.lastInsight && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted py-0.5 px-2 rounded font-medium truncate max-w-[220px]">
                            <Info className="w-3 h-3 text-primary shrink-0" />
                            Insight: {it.lastInsight}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end w-full sm:w-auto shrink-0">
                    {it.status === "available" ? (
                      <Button size="sm" onClick={() => openBookModal(it)} className="w-full sm:w-24 cursor-pointer">
                        Book
                      </Button>
                    ) : (() => {
                      // Check if active approved booking belongs to current user (Admins can return any)
                      const isBookedByMe = myBookings.some(b => 
                        String(b.instrumentId) === String(it.id) && 
                        !b.returnedDate && 
                        b.status === "approved" && 
                        String(b.userId) === String(currentUserId)
                      );
                      
                      const canReturn = isBookedByMe || currentUserRole === "admin";
                      
                      if (canReturn) {
                        return (
                          <Button size="sm" variant="outline" onClick={() => openReturnModal(it)} className="w-full sm:w-24 cursor-pointer">
                            Return
                          </Button>
                        );
                      } else {
                        return (
                          <Button size="sm" variant="secondary" onClick={() => openBookModal(it)} className="w-full sm:w-24 cursor-pointer">
                            Pre-book
                          </Button>
                        );
                      }
                    })()}
                  </div>
                </div>
              )
            })}
            {instruments.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No instruments registered in inventory.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Individual Booking / Pre-booking Modal */}
      <Dialog open={bookModalOpen} onOpenChange={setBookModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isPreBookMode ? (
                <>
                  <span className="inline-flex items-center gap-1.5 text-indigo-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>
                    Pre-book Instrument
                  </span>
                </>
              ) : "Book Instrument"}
            </DialogTitle>
            <DialogDescription>
              {isPreBookMode ? (
                <span>
                  <strong className="text-foreground">{targetInstrument?.name}</strong> is currently <strong className="text-amber-500">{targetInstrument?.status}</strong>
                  {targetInstrument?.bookedBy && <> — held by <strong className="text-foreground">{targetInstrument.bookedBy}</strong> until <strong className="text-foreground">{targetInstrument.nextAvailableDate ? new Date(targetInstrument.nextAvailableDate).toLocaleDateString() : "N/A"}</strong></>}.
                  Choose your preferred date range to queue a pre-booking request.
                </span>
              ) : (
                <>Check out <strong className="text-foreground">{targetInstrument?.name}</strong>. A booking log file will be generated automatically.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBookSubmit} className="space-y-4 pt-2">
            {isPreBookMode ? (
              <>
                {/* Date Range Picker for Pre-booking */}
                <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-4 space-y-3">
                  <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Select Your Pre-booking Date Range</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="preBookStart" className="text-sm">From Date</Label>
                      <Input
                        id="preBookStart"
                        type="date"
                        min={todayStr}
                        value={preBookStartDate}
                        onChange={(e) => {
                          setPreBookStartDate(e.target.value)
                          // Auto-shift end date if it's before new start
                          if (preBookEndDate && e.target.value >= preBookEndDate) {
                            const nextDay = new Date(e.target.value)
                            nextDay.setDate(nextDay.getDate() + 7)
                            setPreBookEndDate(nextDay.toISOString().split("T")[0])
                          }
                        }}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="preBookEnd" className="text-sm">To Date</Label>
                      <Input
                        id="preBookEnd"
                        type="date"
                        min={preBookStartDate || todayStr}
                        value={preBookEndDate}
                        onChange={(e) => setPreBookEndDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  {preBookStartDate && preBookEndDate && new Date(preBookEndDate) > new Date(preBookStartDate) && (
                    <p className="text-xs text-indigo-600 font-medium">
                      Duration: {Math.ceil((new Date(preBookEndDate) - new Date(preBookStartDate)) / (1000 * 60 * 60 * 24))} day(s)
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="bookDays">Days to book</Label>
                <Input
                  id="bookDays"
                  type="number"
                  min="1"
                  value={bookDays}
                  onChange={(e) => setBookDays(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="bookRemarks">Remarks / Notes</Label>
              <Textarea
                id="bookRemarks"
                placeholder="Include details about project name, lab location, or purpose..."
                value={bookRemarks}
                onChange={(e) => setBookRemarks(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBookModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className={isPreBookMode ? "bg-indigo-600 hover:bg-indigo-700 text-white" : ""}>
                {isPreBookMode ? "Submit Pre-booking Request" : "Confirm Booking"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Individual Return Modal */}
      <Dialog open={returnModalOpen} onOpenChange={setReturnModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return Instrument</DialogTitle>
            <DialogDescription>
              Complete the return checklist for <strong className="text-foreground">{targetInstrument?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReturnSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="returnRemarks">Remarks</Label>
              <Input 
                id="returnRemarks" 
                placeholder="e.g., good" 
                value={returnRemarks} 
                onChange={(e) => setReturnRemarks(e.target.value)} 
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="returnInsight">Asset Insight / Condition Notes (Optional)</Label>
              <Textarea 
                id="returnInsight" 
                placeholder="Write any observed defects, calibration offsets, or general performance logs for the next user..." 
                value={returnInsight} 
                onChange={(e) => setReturnInsight(e.target.value)} 
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReturnModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="default">Complete Return</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Booking Modal */}
      <Dialog open={bulkBookModalOpen} onOpenChange={setBulkBookModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Booking</DialogTitle>
            <DialogDescription>
              Specify details for checking out multiple selected items.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBulkBookSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="bulkBookDays">Days to book</Label>
              <Input 
                id="bulkBookDays" 
                type="number" 
                min="1" 
                value={bookDays} 
                onChange={(e) => setBookDays(e.target.value)} 
                required 
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulkBookRemarks">Remarks / Notes</Label>
              <Textarea 
                id="bulkBookRemarks" 
                placeholder="Remarks for these bookings..." 
                value={bookRemarks} 
                onChange={(e) => setBookRemarks(e.target.value)} 
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBulkBookModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Book Instruments</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Pre-book Modal */}
      <Dialog open={bulkPreBookModalOpen} onOpenChange={setBulkPreBookModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-500">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>
              Bulk Pre-booking
            </DialogTitle>
            <DialogDescription>
              Queue a pre-booking request for <strong className="text-foreground">{selectedIds.filter(id => { const inst = instruments.find(i => i.id === id); return inst && inst.status !== "available"; }).length}</strong> selected instrument(s) that are currently in use.
              Select your preferred date range.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBulkPreBookSubmit} className="space-y-4 pt-2">
            <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-4 space-y-3">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Select Your Pre-booking Date Range</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="bulkPreStart" className="text-sm">From Date</Label>
                  <Input
                    id="bulkPreStart"
                    type="date"
                    min={todayStr}
                    value={bulkPreBookStartDate}
                    onChange={(e) => {
                      setBulkPreBookStartDate(e.target.value)
                      if (bulkPreBookEndDate && e.target.value >= bulkPreBookEndDate) {
                        const nextDay = new Date(e.target.value)
                        nextDay.setDate(nextDay.getDate() + 7)
                        setBulkPreBookEndDate(nextDay.toISOString().split("T")[0])
                      }
                    }}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bulkPreEnd" className="text-sm">To Date</Label>
                  <Input
                    id="bulkPreEnd"
                    type="date"
                    min={bulkPreBookStartDate || todayStr}
                    value={bulkPreBookEndDate}
                    onChange={(e) => setBulkPreBookEndDate(e.target.value)}
                    required
                  />
                </div>
              </div>
              {bulkPreBookStartDate && bulkPreBookEndDate && new Date(bulkPreBookEndDate) > new Date(bulkPreBookStartDate) && (
                <p className="text-xs text-indigo-600 font-medium">
                  Duration: {Math.ceil((new Date(bulkPreBookEndDate) - new Date(bulkPreBookStartDate)) / (1000 * 60 * 60 * 24))} day(s) for all selected instruments
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulkPreRemarks">Remarks / Notes</Label>
              <Textarea
                id="bulkPreRemarks"
                placeholder="Include project details, lab location, or purpose..."
                value={bulkPreBookRemarks}
                onChange={(e) => setBulkPreBookRemarks(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBulkPreBookModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                Submit Bulk Pre-booking
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Return Modal */}
      <Dialog open={bulkReturnModalOpen} onOpenChange={setBulkReturnModalOpen}>
        <DialogContent className="max-w-md md:max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Returns</DialogTitle>
            <DialogDescription>
              Process returns for selected instruments.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBulkReturnSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="bulkReturnRemarks">Common Return Remarks (applied to all)</Label>
              <Textarea 
                id="bulkReturnRemarks" 
                placeholder="e.g., good" 
                value={bulkReturnRemarks} 
                onChange={(e) => setBulkReturnRemarks(e.target.value)} 
                required
              />
            </div>
            
            <div className="flex items-center space-x-2 pt-2 border-t">
              <Checkbox 
                id="addPerInstrumentNotes" 
                checked={addPerInstrumentNotes} 
                onChange={(e) => setAddPerInstrumentNotes(e.target.checked)} 
              />
              <Label htmlFor="addPerInstrumentNotes" className="cursor-pointer font-semibold">
                Add separate insights for each instrument
              </Label>
            </div>

            {addPerInstrumentNotes && (
              <div className="max-h-[220px] overflow-y-auto space-y-3 pt-2 pr-1">
                {selectedIds
                  .map(id => instruments.find(i => i.id === id))
                  .filter(i => i && i.status === "booked")
                  .map(it => (
                    <div key={it.id} className="space-y-1 border-l-2 border-primary pl-2.5">
                      <Label className="text-xs font-semibold">{it.name} ({it.model})</Label>
                      <Textarea 
                        placeholder="Condition / insight for this specific instrument..."
                        value={perInstrumentNotes[it.id] || ""}
                        onChange={(e) => handlePerInstrumentNoteChange(it.id, e.target.value)}
                        className="min-h-[50px] text-xs py-1"
                      />
                    </div>
                  ))}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBulkReturnModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Return Selected</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="shadow-sm mt-8 border-l-4 border-l-primary">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            {currentUserRole === "admin" ? "Recent Transaction History" : "My Recent Transactions"}
          </CardTitle>
          <CardDescription>Showing the 10 most recent booking and return transactions for quick lookup.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[700px] sm:min-w-full">
              <TableHeader>
                <TableRow>
                  <TableHead>Instrument</TableHead>
                  {currentUserRole === "admin" && <TableHead>Booked By</TableHead>}
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Sheet</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myBookings.slice(0, 10).map(first => {
                  const status = first.status || "approved";
                  const start = new Date(first.startDate).toLocaleDateString();
                  const due = new Date(first.dueDate).toLocaleDateString();
                  const sheetUrl = first.sheetUrl || null;
                  return (
                    <TableRow key={first.id} className="hover:bg-accent/20 align-top">
                      <TableCell className="font-semibold text-foreground">
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
                      </TableCell>
                      {currentUserRole === "admin" && (
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
                        {sheetUrl ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 flex items-center gap-1.5 text-primary hover:text-primary font-semibold border-primary/20 hover:border-primary/50 hover:bg-primary/5 cursor-pointer"
                            onClick={() => offerDownload(sheetUrl)}
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>XLSX</span>
                          </Button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/60 italic">No sheet</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {myBookings.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={currentUserRole === "admin" ? 6 : 5} className="text-center py-6 text-muted-foreground">
                      No recent transaction records available.
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
