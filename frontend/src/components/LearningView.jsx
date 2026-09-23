import React, { useState, useMemo } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { BookOpen, Video, ExternalLink, HelpCircle, FileText, Compass, ListTodo, ShieldAlert } from "lucide-react"

export default function LearningView({ instruments }) {
  const [selectedInstrument, setSelectedInstrument] = useState(null)
  const [activeImageIndex, setActiveImageIndex] = useState(0)

  const handleCardClick = (it) => {
    setSelectedInstrument(it)
    setActiveImageIndex(0)
  }

  const getImages = (it) => {
    if (!it) return []
    return Array.isArray(it.productImages) ? it.productImages.filter(Boolean) : []
  }

  // Deduplicate instruments by brand + model for the learning view.
  // Merge learning fields from ALL instances so no seeded data is lost.
  const uniqueInstruments = useMemo(() => {
    const learningFields = [
      'productOverview', 'specifications', 'parametersMeasured',
      'accuracy', 'measurementRange', 'resolution',
      'applications', 'operatingProcedure', 'calibrationProcedure',
      'safetyInstructions', 'productImages', 'userManualUrl', 'youtubeUrl'
    ]

    const groups = {}
    for (const inst of instruments) {
      const key = ((inst.brand || '') + '|||' + (inst.model || '')).toLowerCase()
      if (!groups[key]) groups[key] = []
      groups[key].push(inst)
    }

    return Object.values(groups).map(group => {
      // Start from first item, then merge any missing fields from others
      const merged = { ...group[0] }
      for (let i = 1; i < group.length; i++) {
        const other = group[i]
        for (const field of learningFields) {
          const mVal = merged[field]
          const oVal = other[field]
          const mEmpty = !mVal || (Array.isArray(mVal) && mVal.length === 0) || (typeof mVal === 'string' && mVal.trim() === '')
          const oHas = oVal && (Array.isArray(oVal) ? oVal.length > 0 : String(oVal).trim() !== '')
          if (mEmpty && oHas) {
            merged[field] = oVal
          }
          // For productImages, concatenate unique images from all instances
          if (field === 'productImages' && oHas) {
            const existing = Array.isArray(merged.productImages) ? merged.productImages : []
            const extra = Array.isArray(oVal) ? oVal : []
            merged.productImages = [...new Set([...existing, ...extra])]
          }
        }
      }
      merged._unitCount = group.length
      return merged
    })
  }, [instruments])

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent rounded-xl p-6 border shadow-sm">
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <BookOpen className="w-8 h-8 text-primary" /> Learning Center
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Select any instrument to open its full engineering handbook. Explore step-by-step operating procedures, safety declarations, and official training videos.
        </p>
      </div>

      {uniqueInstruments.length === 0 ? (
        <Card className="border-dashed py-12">
          <CardContent className="flex flex-col items-center justify-center space-y-3">
            <Compass className="w-12 h-12 text-muted-foreground stroke-1" />
            <p className="text-muted-foreground text-center">
              No instruments in inventory. Register an instrument in the Inventory tab to load its specs.
            </p>
          </CardContent>
        </Card>
      ) : (
        /* Instruments Previews Grid */
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {uniqueInstruments.map(it => {
            const images = getImages(it)
            const hasImage = images.length > 0
            
            return (
              <Card 
                key={it.id}
                onClick={() => handleCardClick(it)}
                className="overflow-hidden hover:shadow-lg hover:border-primary/40 hover:-translate-y-1 transition-all duration-300 cursor-pointer group flex flex-col h-full bg-card"
              >
                {/* Image Previews */}
                <div className="relative aspect-video w-full bg-muted flex items-center justify-center overflow-hidden border-b">
                  {hasImage ? (
                    <img 
                      src={images[0]} 
                      alt={it.name}
                      className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <Compass className="w-8 h-8 text-muted-foreground/50 stroke-1" />
                  )}
                  <div className="absolute top-2 right-2 flex gap-1">
                    {it._unitCount > 1 && (
                      <Badge variant="outline" className="backdrop-blur-md bg-background/80 text-[10px] py-0 px-2 font-bold">
                        {it._unitCount} units
                      </Badge>
                    )}
                    <Badge variant="secondary" className="backdrop-blur-md bg-background/80 text-[10px] py-0 px-2 uppercase tracking-wider font-semibold">
                      {it.category || "Instrument"}
                    </Badge>
                  </div>
                </div>

                <CardContent className="p-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-1">
                    <h3 className="font-semibold text-sm leading-snug group-hover:text-primary transition-colors text-foreground line-clamp-2">
                      {it.name}
                    </h3>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {it.brand ? `${it.brand} — ` : ""}{it.model || "Model not set"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Detailed Technical Specification Sheet Modal */}
      <Dialog 
        open={!!selectedInstrument} 
        onOpenChange={(open) => !open && setSelectedInstrument(null)}
      >
        <DialogContent className="max-w-5xl md:max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto p-0 bg-card text-card-foreground border shadow-2xl">
          {selectedInstrument && (() => {
            const images = getImages(selectedInstrument)
            const hasImages = images.length > 0
            
            return (
              <div className="flex flex-col">
                {/* Header Section */}
                <div className="p-6 border-b bg-muted/30">
                  <h2 className="text-2xl font-bold text-foreground">
                    {selectedInstrument.name}
                  </h2>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Badge variant="default" className="text-xs">
                      {selectedInstrument.category || "General"}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-medium">
                      Brand: <span className="text-foreground">{selectedInstrument.brand || "Premium"}</span>
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      • SN: {selectedInstrument.serial}
                    </span>
                  </div>
                </div>

                {/* Body Content Split */}
                <div className="grid md:grid-cols-5 gap-6 p-6">
                  {/* Left Column: Images, Overview, Facts */}
                  <div className="md:col-span-2 space-y-6">
                    {/* Image Viewer */}
                    <div className="space-y-3">
                      <div className="aspect-square bg-muted rounded-lg overflow-hidden border flex items-center justify-center">
                        {hasImages ? (
                          <img 
                            src={images[activeImageIndex]} 
                            alt={selectedInstrument.name}
                            className="object-cover w-full h-full"
                          />
                        ) : (
                          <Compass className="w-16 h-16 text-muted-foreground/30 stroke-1" />
                        )}
                      </div>
                      
                      {/* Thumbnail strip */}
                      {images.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {images.map((src, index) => (
                            <button
                              key={index}
                              onClick={() => setActiveImageIndex(index)}
                              className={`w-12 h-12 rounded border overflow-hidden shrink-0 transition-all ${
                                activeImageIndex === index 
                                  ? "border-primary ring-1 ring-primary" 
                                  : "border-muted hover:border-foreground/30"
                              }`}
                            >
                              <img src={src} alt="thumbnail" className="object-cover w-full h-full" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Overview */}
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Compass className="w-3.5 h-3.5" /> Product Overview
                      </h4>
                      <p className="text-sm leading-relaxed text-foreground bg-muted/20 p-3 rounded-lg border whitespace-pre-wrap">
                        {selectedInstrument.productOverview || "No overview provided for this instrument yet."}
                      </p>
                    </div>

                    {/* Quick Facts Card */}
                    <div className="bg-muted/30 rounded-lg p-4 border space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quick Specs</h4>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-3 text-xs">
                        <div>
                          <span className="text-muted-foreground block">Model</span>
                          <span className="font-semibold text-foreground font-mono truncate block">{selectedInstrument.model || "—"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Brand</span>
                          <span className="font-semibold text-foreground block truncate">{selectedInstrument.brand || "—"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Category</span>
                          <span className="font-semibold text-foreground block truncate">{selectedInstrument.category || "—"}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Storage Location</span>
                          <span className="font-semibold text-foreground block truncate">{selectedInstrument.location || "—"}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Detailed Sections (Accordion-like or List) */}
                  <div className="md:col-span-3 space-y-6">
                    <div className="space-y-5">
                      {[
                        { title: "Specifications", content: selectedInstrument.specifications, icon: <ListTodo className="w-4 h-4 text-primary" /> },
                        { title: "Parameters Measured", content: selectedInstrument.parametersMeasured, icon: <Compass className="w-4 h-4 text-primary" /> },
                        { title: "Performance Metrics", content: (selectedInstrument.accuracy || selectedInstrument.measurementRange || selectedInstrument.resolution) && (
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div className="bg-muted/40 p-2.5 rounded border">
                              <span className="text-[10px] text-muted-foreground block uppercase font-medium">Accuracy</span>
                              <span className="font-semibold text-foreground block mt-0.5">{selectedInstrument.accuracy || "—"}</span>
                            </div>
                            <div className="bg-muted/40 p-2.5 rounded border">
                              <span className="text-[10px] text-muted-foreground block uppercase font-medium">Range</span>
                              <span className="font-semibold text-foreground block mt-0.5">{selectedInstrument.measurementRange || "—"}</span>
                            </div>
                            <div className="bg-muted/40 p-2.5 rounded border">
                              <span className="text-[10px] text-muted-foreground block uppercase font-medium">Resolution</span>
                              <span className="font-semibold text-foreground block mt-0.5">{selectedInstrument.resolution || "—"}</span>
                            </div>
                          </div>
                        ), icon: <Compass className="w-4 h-4 text-primary" /> },
                        { title: "Applications", content: selectedInstrument.applications, icon: <Compass className="w-4 h-4 text-primary" /> },
                        { title: "Operating Procedure", content: selectedInstrument.operatingProcedure, icon: <ListTodo className="w-4 h-4 text-primary" /> },
                        { title: "Calibration Procedure", content: selectedInstrument.calibrationProcedure, icon: <ListTodo className="w-4 h-4 text-primary" /> },
                        { title: "Safety Instructions", content: selectedInstrument.safetyInstructions, icon: <ShieldAlert className="w-4 h-4 text-destructive" />, isWarning: true }
                      ].map((sec, idx) => {
                        if (!sec.content) return null
                        return (
                          <div 
                            key={idx} 
                            className={`p-4 rounded-lg border space-y-2 transition-colors ${
                              sec.isWarning ? "bg-red-500/5 border-red-500/20" : "bg-card"
                            }`}
                          >
                            <h4 className="text-sm font-bold flex items-center gap-2 text-foreground">
                              {sec.icon} {sec.title}
                            </h4>
                            <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                              {sec.content}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Resources Links buttons */}
                    {(selectedInstrument.userManualUrl || selectedInstrument.youtubeUrl) && (
                      <div className="pt-4 border-t flex flex-wrap gap-2">
                        {selectedInstrument.userManualUrl && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="gap-2"
                            onClick={() => window.open(selectedInstrument.userManualUrl, "_blank", "noopener,noreferrer")}
                          >
                            <FileText className="w-4 h-4 text-red-500" /> Open User Manual (PDF) <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {selectedInstrument.youtubeUrl && (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="gap-2 hover:border-red-500 hover:text-red-500"
                            onClick={() => window.open(selectedInstrument.youtubeUrl, "_blank", "noopener,noreferrer")}
                          >
                            <Video className="w-4 h-4 text-red-500" /> Watch Demo Video <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
