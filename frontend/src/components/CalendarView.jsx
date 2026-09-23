import React, { useState, useEffect } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Calendar, User, Info, Layers } from "lucide-react"

export default function CalendarView({ refreshKey }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [bookings, setBookings] = useState([])
  const [selectedDayBookings, setSelectedDayBookings] = useState(null)
  const [selectedDayStr, setSelectedDayStr] = useState("")

  const loadBookings = async () => {
    try {
      const res = await fetch("/api/bookings")
      if (res.ok) {
        const data = await res.json()
        setBookings(data)
      }
    } catch (err) {
      console.error("Failed to load calendar bookings", err)
    }
  }

  useEffect(() => {
    loadBookings()
  }, [refreshKey])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ]

  // Helper to get number of days in month
  const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate()
  // Helper to get start day of the month (0 = Sunday)
  const getStartDayOfMonth = (y, m) => new Date(y, m, 1).getDay()

  const daysInMonth = getDaysInMonth(year, month)
  const startDay = getStartDayOfMonth(year, month)

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
    setSelectedDayBookings(null)
  }

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
    setSelectedDayBookings(null)
  }

  // Filter bookings overlapping with a specific date
  const getBookingsForDate = (day) => {
    const targetDate = new Date(year, month, day)
    targetDate.setHours(0, 0, 0, 0)

    return bookings.filter(b => {
      const start = new Date(b.startDate)
      start.setHours(0, 0, 0, 0)
      const due = new Date(b.dueDate)
      due.setHours(23, 59, 59, 999)

      // Exclude returned/cancelled unless active
      if (b.returnedDate) {
        const ret = new Date(b.returnedDate)
        ret.setHours(23, 59, 59, 999)
        return targetDate >= start && targetDate <= ret
      }

      return targetDate >= start && targetDate <= due && b.status !== "denied"
    })
  }

  const handleDayClick = (day) => {
    const dayB = getBookingsForDate(day)
    setSelectedDayBookings(dayB)
    setSelectedDayStr(`${monthNames[month]} ${day}, ${year}`)
  }

  // Render calendar grid days
  const calendarCells = []
  // Empty cells for padding before the 1st
  for (let i = 0; i < startDay; i++) {
    calendarCells.push(<div key={`empty-${i}`} className="h-24 border-r border-b bg-muted/10" />)
  }

  // Actual days
  for (let day = 1; day <= daysInMonth; day++) {
    const dayB = getBookingsForDate(day)
    const isToday = new Date().toDateString() === new Date(year, month, day).toDateString()

    calendarCells.push(
      <div
        key={`day-${day}`}
        onClick={() => handleDayClick(day)}
        className={`h-24 border-r border-b p-1.5 flex flex-col justify-between hover:bg-accent/40 transition-all cursor-pointer relative ${
          isToday ? "bg-primary/5" : ""
        }`}
      >
        <span className={`text-xs font-semibold ${isToday ? "w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-sm" : "text-foreground"}`}>
          {day}
        </span>
        <div className="space-y-0.5 max-h-[60px] overflow-hidden select-none">
          {dayB.slice(0, 3).map((b, idx) => {
            const isPre = b.bulkGroupId;
            const statusColor = b.status === "pending" 
              ? "bg-amber-500/10 text-amber-600 border border-amber-500/25" 
              : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/25";
            return (
              <div 
                key={b.id || idx} 
                className={`text-[9px] px-1 py-0.5 rounded font-medium truncate leading-tight ${statusColor}`}
                title={`${b.instrumentName} - ${b.userName}`}
              >
                {b.instrumentName}
              </div>
            )
          })}
          {dayB.length > 3 && (
            <div className="text-[8px] text-muted-foreground font-semibold pl-1 font-mono">
              + {dayB.length - 3} more
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Schedules & Calendar</h1>
        <p className="text-muted-foreground">Track booking periods, checkouts, and pre-booking timelines.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        {/* Calendar Grid */}
        <Card className="md:col-span-3 shadow-sm border">
          <CardHeader className="flex flex-row items-center justify-between pb-4 border-b">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              <CardTitle className="text-lg font-bold">
                {monthNames[month]} {year}
              </CardTitle>
            </div>
            <div className="flex gap-1.5">
              <Button size="icon" variant="outline" className="h-8 w-8 cursor-pointer" onClick={prevMonth}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button size="icon" variant="outline" className="h-8 w-8 cursor-pointer" onClick={nextMonth}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Week days labels */}
            <div className="grid grid-cols-7 border-b bg-muted/20 text-center py-2 text-xs font-semibold text-muted-foreground">
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
            </div>
            {/* Calendar Days */}
            <div className="grid grid-cols-7 border-l">
              {calendarCells}
            </div>
          </CardContent>
        </Card>

        {/* Selected Day Bookings Detail Side Panel */}
        <Card className="md:col-span-1 shadow-sm border flex flex-col justify-between h-fit min-h-[300px]">
          <CardHeader className="border-b bg-muted/20">
            <CardTitle className="text-sm font-bold flex items-center gap-1.5 text-foreground">
              <Info className="w-4.5 h-4.5 text-primary" />
              Schedule Details
            </CardTitle>
            <CardDescription className="text-xs">
              {selectedDayStr || "Click a day to see schedules"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 flex-1 overflow-y-auto space-y-4">
            {selectedDayBookings === null ? (
              <div className="text-center py-10 text-muted-foreground text-xs italic">
                Select a day to view its instrument checkout schedules.
              </div>
            ) : selectedDayBookings.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-xs">
                No active bookings on this day.
              </div>
            ) : (
              <div className="space-y-3">
                {selectedDayBookings.map((b) => (
                  <div key={b.id} className="p-3 border rounded-lg bg-card space-y-2 hover:shadow-sm transition-all">
                    <div>
                      <div className="text-xs font-bold text-foreground leading-snug">{b.instrumentName}</div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        Model: {b.instrumentModel} ({b.instrumentSerial})
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1.5 text-xs">
                      <User className="w-3.5 h-3.5 text-muted-foreground/60" />
                      <span className="font-semibold text-foreground">{b.userName}</span>
                    </div>

                    <div className="flex items-center justify-between text-[10px] pt-1.5 border-t">
                      <span className={`px-1.5 py-0.5 rounded font-semibold capitalize ${
                        b.status === "pending" 
                          ? "bg-amber-500/10 text-amber-600" 
                          : "bg-emerald-500/10 text-emerald-600"
                      }`}>
                        {b.status === "pending" ? "Awaiting Approval" : b.status}
                      </span>
                      <span className="text-muted-foreground font-medium">
                        Until {new Date(b.dueDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
