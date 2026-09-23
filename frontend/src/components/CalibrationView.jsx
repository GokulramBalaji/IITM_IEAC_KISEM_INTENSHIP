import React, { useState } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { FileText, CalendarCheck, AlertTriangle } from "lucide-react"

export default function CalibrationView({ instruments, currentUserId, loadAll }) {
  const [calibrateModalOpen, setCalibrateModalOpen] = useState(false)
  const [targetInstrument, setTargetInstrument] = useState(null)
  
  // Form State
  const [certificateUrl, setCertificateUrl] = useState("")
  const [cycleDays, setCycleDays] = useState("365")

  const formatDateLabel = (value) => {
    if (!value) return "Not set"
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? "Not set" : d.toLocaleDateString()
  }

  const getDaysLeft = (dateStr) => {
    if (!dateStr) return Infinity
    const dueMs = new Date(dateStr) - new Date()
    return Math.round(dueMs / (24 * 3600 * 1000))
  }

  const openCalibrateModal = (it) => {
    setTargetInstrument(it)
    setCertificateUrl(it.calibrationCertificateUrl || "")
    setCycleDays(String(it.calibrationCycleDays || 365))
    setCalibrateModalOpen(true)
  }

  const handleCalibrateSubmit = async (e) => {
    e.preventDefault()
    if (!targetInstrument) return

    try {
      const res = await fetch("/api/calibrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instrumentId: targetInstrument.id,
          byUserId: currentUserId,
          certificateUrl,
          cycleDays: Number(cycleDays) || 365
        })
      })

      if (res.ok) {
        setCalibrateModalOpen(false)
        loadAll()
      } else {
        alert("Failed to submit calibration update.")
      }
    } catch (err) {
      console.error("Calibration error", err)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Calibration</h1>
        <p className="text-muted-foreground">Monitor service schedules, due lists, and upload safety certificates.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Calibration Schedule</CardTitle>
          <CardDescription>
            Keep track of calibration cycles to ensure measurements remain certified and reliable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {instruments.map(it => {
            const daysLeft = getDaysLeft(it.nextCalibrationDate)
            const isOverdue = daysLeft <= 0
            const isDueSoon = daysLeft > 0 && daysLeft <= 7
            
            return (
              <div 
                key={it.id}
                className={`flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-lg transition-all gap-4 ${
                  isOverdue || isDueSoon 
                    ? "bg-red-500/5 border-red-500/30" 
                    : "hover:bg-accent/40"
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground text-sm">{it.name} {it.model}</span>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      SN: {it.serial}
                    </Badge>
                    {isOverdue && (
                      <Badge variant="destructive" className="text-[10px] animate-pulse">
                        Overdue
                      </Badge>
                    )}
                    {isDueSoon && (
                      <Badge variant="destructive" className="text-[10px]">
                        Due in {daysLeft} days
                      </Badge>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>
                      Last calibration: <span className="font-medium text-foreground">{formatDateLabel(it.lastCalibrationDate)}</span>
                    </div>
                    <div>
                      Next due: <span className="font-medium text-foreground">
                        {it.nextCalibrationDate ? `${new Date(it.nextCalibrationDate).toLocaleDateString()} (${isFinite(daysLeft) ? `${daysLeft} days left` : "n/a"})` : "Not scheduled"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 shrink-0 md:justify-end">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={!it.calibrationCertificateUrl}
                    onClick={() => window.open(it.calibrationCertificateUrl, "_blank", "noopener,noreferrer")}
                    className="gap-1.5 text-xs h-8"
                  >
                    <FileText className="w-3.5 h-3.5" /> View Certificate
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={() => openCalibrateModal(it)}
                    className="gap-1.5 text-xs h-8"
                  >
                    <CalendarCheck className="w-3.5 h-3.5" /> Mark Calibrated
                  </Button>
                </div>
              </div>
            )
          })}
          {instruments.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No instruments registered in inventory.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mark Calibrated Dialog */}
      <Dialog open={calibrateModalOpen} onOpenChange={setCalibrateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Calibration Record</DialogTitle>
            <DialogDescription>
              Mark <strong className="text-foreground">{targetInstrument?.name}</strong> as calibrated and update its next schedule date.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCalibrateSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="certUrl">Certificate Link (Optional URL)</Label>
              <Input 
                id="certUrl" 
                placeholder="e.g., https://example.com/certs/cert-123.pdf" 
                value={certificateUrl} 
                onChange={(e) => setCertificateUrl(e.target.value)} 
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cycleDays">Calibration Cycle Duration (days)</Label>
              <Input 
                id="cycleDays" 
                type="number" 
                min="1" 
                value={cycleDays} 
                onChange={(e) => setCycleDays(e.target.value)} 
                required 
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCalibrateModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Submit Record</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
