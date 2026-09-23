import React, { useState, useEffect } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { 
  UserPlus, Users, Phone, Mail, KeyRound, User, CheckCircle2, AlertCircle, 
  Trash2, Database, Download, AlertTriangle, Edit3, Briefcase, Building, 
  Umbrella, Save, Sliders, Shield
} from "lucide-react"

// Modal to allow Admin full ARMD customization of an individual employee's leave quota
function EmployeeLeaveQuotaModal({ employee, onClose }) {
  const [balances, setBalances] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [editValues, setEditValues] = useState({})
  const [successMsg, setSuccessMsg] = useState("")
  const [errorMsg, setErrorMsg] = useState("")

  const loadBalances = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/leave-balance/${employee.id}`)
      if (res.ok) {
        const data = await res.json()
        setBalances(data)
        const initial = {}
        data.forEach(b => {
          initial[b.leaveTypeId] = {
            totalDays: b.totalDays ?? 12,
            usedDays: b.usedDays ?? 0
          }
        })
        setEditValues(initial)
      }
    } catch (_) {}
    setLoading(false)
  }

  useEffect(() => {
    if (employee) loadBalances()
  }, [employee])

  const handleValueChange = (leaveTypeId, field, val) => {
    setEditValues(p => ({
      ...p,
      [leaveTypeId]: {
        ...(p[leaveTypeId] || {}),
        [field]: Number(val)
      }
    }))
  }

  const handleSave = async (leaveTypeId) => {
    setSavingId(leaveTypeId)
    setSuccessMsg("")
    setErrorMsg("")
    try {
      const payload = editValues[leaveTypeId] || {}
      const res = await fetch(`/api/leave-balance/${employee.id}/${leaveTypeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totalDays: Number(payload.totalDays) || 0,
          usedDays: Number(payload.usedDays) || 0
        })
      })
      if (res.ok) {
        setSuccessMsg("Leave quota updated successfully.")
        setTimeout(() => setSuccessMsg(""), 3500)
        loadBalances()
      } else {
        const d = await res.json()
        setErrorMsg(d.error || "Failed to update quota.")
      }
    } catch (_) {
      setErrorMsg("Network connection error.")
    } finally {
      setSavingId(null)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Umbrella className="w-5 h-5 text-amber-500" />
            Customize Leave Quotas (ARMD)
          </DialogTitle>
          <DialogDescription className="text-xs">
            Adjust customized yearly leave allocations and used days for <strong>{employee?.name}</strong> ({employee?.role})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {successMsg && (
            <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}
          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-xs font-semibold text-destructive flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {loading ? (
            <div className="space-y-2 py-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : balances.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No leave categories registered in system settings.</p>
          ) : (
            <div className="space-y-3">
              {balances.map(b => {
                const cur = editValues[b.leaveTypeId] || { totalDays: b.totalDays, usedDays: b.usedDays }
                const isSaving = savingId === b.leaveTypeId
                return (
                  <div key={b.leaveTypeId} className="p-3 rounded-xl border bg-card/60 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.color || '#3b82f6' }} />
                        <span className="text-sm font-semibold truncate">{b.leaveTypeName}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Current: {b.usedDays || 0} used / {b.totalDays || 0} total
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div>
                        <span className="text-[9px] text-muted-foreground block text-center font-medium">Quota Days</span>
                        <Input 
                          type="number"
                          min="0"
                          max="90"
                          value={cur.totalDays}
                          onChange={e => handleValueChange(b.leaveTypeId, "totalDays", e.target.value)}
                          className="w-16 h-8 text-xs text-center font-semibold"
                        />
                      </div>
                      <div>
                        <span className="text-[9px] text-muted-foreground block text-center font-medium">Used Days</span>
                        <Input 
                          type="number"
                          min="0"
                          max="90"
                          value={cur.usedDays}
                          onChange={e => handleValueChange(b.leaveTypeId, "usedDays", e.target.value)}
                          className="w-16 h-8 text-xs text-center"
                        />
                      </div>
                      <div className="pt-3">
                        <Button 
                          size="sm" 
                          className="h-8 px-2.5 text-xs gap-1"
                          onClick={() => handleSave(b.leaveTypeId)}
                          disabled={isSaving}
                        >
                          <Save className="w-3 h-3" />
                          {isSaving ? "..." : "Save"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function UserManagementView({ currentUser, offerDownload }) {
  const isPrimaryAdmin = ['admin', 'admin@iitm.com'].includes((currentUser?.email || '').toLowerCase())

  const [users, setUsers] = useState([])
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState("engineer")
  const [department, setDepartment] = useState("Energy Auditing")
  const [designation, setDesignation] = useState("Field Engineer")
  const [status, setStatus] = useState("active")
  
  const [success, setSuccess] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [editingUser, setEditingUser] = useState(null)
  const [quotaEmployee, setQuotaEmployee] = useState(null)

  const startEdit = (userToEdit) => {
    setSuccess("")
    setError("")
    setEditingUser(userToEdit)
    setName(userToEdit.name || "")
    setEmail(userToEdit.email || "")
    setPhone(userToEdit.phone || "")
    setPassword("")
    setRole(userToEdit.role || "engineer")
    setDepartment(userToEdit.department || "Energy Auditing")
    setDesignation(userToEdit.designation || (userToEdit.role === 'intern' ? 'Trainee' : userToEdit.role === 'auditor' ? 'Senior Auditor' : userToEdit.role === 'hr' ? 'HR Manager' : userToEdit.role === 'admin' ? 'Administrator' : 'Field Engineer'))
    setStatus(userToEdit.status || "active")
  }

  const cancelEdit = () => {
    setSuccess("")
    setError("")
    setEditingUser(null)
    setName("")
    setEmail("")
    setPhone("")
    setPassword("")
    setRole("engineer")
    setDepartment("Energy Auditing")
    setDesignation("Field Engineer")
    setStatus("active")
  }

  // System Maintenance States
  const [extractStart, setExtractStart] = useState("")
  const [extractEnd, setExtractEnd] = useState("")
  const [clearStart, setClearStart] = useState("")
  const [clearEnd, setClearEnd] = useState("")
  const [confirmClear, setConfirmClear] = useState(false)
  const [systemSuccess, setSystemSuccess] = useState("")
  const [systemError, setSystemError] = useState("")

  const handleExtract = async (e) => {
    e.preventDefault()
    setSystemSuccess("")
    setSystemError("")
    if (!extractStart || !extractEnd) {
      setSystemError("Please select both from and to dates.")
      return
    }
    if (new Date(extractEnd) < new Date(extractStart)) {
      setSystemError("End date cannot be before start date.")
      return
    }
    try {
      const res = await fetch(`/api/admin/extract-bookings?start=${extractStart}&end=${extractEnd}`)
      const data = await res.json()
      if (res.ok && data.sheet) {
        setSystemSuccess("Spreadsheet generated successfully. Starting download...")
        offerDownload(data.sheet)
      } else {
        setSystemError(data.error || "Failed to extract booking records.")
      }
    } catch (err) {
      console.error("Extract failed", err)
      setSystemError("Failed to connect to the server.")
    }
  }

  const handleClear = async (e) => {
    e.preventDefault()
    setSystemSuccess("")
    setSystemError("")

    const isClearAll = !clearStart && !clearEnd
    if (!isClearAll && (!clearStart || !clearEnd)) {
      setSystemError("Please select both from and to dates, or clear all history by leaving the fields empty.")
      return
    }
    if (!isClearAll && new Date(clearEnd) < new Date(clearStart)) {
      setSystemError("End date cannot be before start date.")
      return
    }

    if (!confirmClear) {
      setConfirmClear(true)
      setTimeout(() => {
        setConfirmClear(false)
      }, 5000)
      return
    }

    setConfirmClear(false)
    try {
      const res = await fetch("/api/admin/clear-bookings", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: clearStart || null, end: clearEnd || null })
      })
      const data = await res.json()
      if (res.ok) {
        setSystemSuccess(`Successfully cleared ${data.count} booking records from history.`)
        setClearStart("")
        setClearEnd("")
      } else {
        setSystemError(data.error || "Failed to clear booking records.")
      }
    } catch (err) {
      console.error("Clear failed", err)
      setSystemError("Failed to connect to the server.")
    }
  }

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users")
      if (res.ok) {
        const data = await res.json()
        setUsers(data)
      }
    } catch (err) {
      console.error("Failed to fetch users", err)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSuccess("")
    setError("")
    setLoading(true)

    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : "/api/users"
      const method = editingUser ? "PUT" : "POST"

      const payload = { 
        name, 
        email, 
        phone, 
        role,
        department,
        designation,
        status
      }

      if (password) {
        payload.password = password
      } else if (!editingUser) {
        setError("Password is required for new users.")
        setLoading(false)
        return
      }

      const res = await fetch(url, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })

      const data = await res.json()

      if (res.ok) {
        if (editingUser) {
          setSuccess(`User "${name}" updated successfully.`)
          cancelEdit()
        } else {
          setSuccess(`User "${name}" created successfully.`)
          cancelEdit()
        }
        fetchUsers()
      } else {
        setError(data.error || `Failed to ${editingUser ? 'update' : 'create'} user.`)
      }
    } catch (err) {
      console.error(`Error ${editingUser ? 'updating' : 'creating'} user`, err)
      setError("Server connection failed.")
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (userId, userName) => {
    if (confirmDeleteId !== userId) {
      setConfirmDeleteId(userId)
      setTimeout(() => {
        setConfirmDeleteId(prev => prev === userId ? null : prev)
      }, 5000)
      return
    }
    setConfirmDeleteId(null)
    setError("")
    setSuccess("")
    try {
      const res = await fetch(`/api/users/${userId}`, { method: "DELETE" })
      const data = await res.json()
      if (res.ok) {
        setSuccess(`User "${userName}" removed.`)
        fetchUsers()
      } else {
        setError(data.error || "Failed to remove user.")
      }
    } catch (err) {
      console.error("Error deleting user", err)
      setError("Server connection failed.")
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Employee & User Management (ARMD)
        </h1>
        <p className="text-muted-foreground text-sm">
          Complete Add, Retrieve, Modify, and Delete authority over staff accounts, designations, and leave quotas.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Create / Edit User Form */}
        <Card className="md:col-span-1 shadow-sm h-fit">
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              {editingUser ? "Edit Employee Profile" : "Register Employee"}
            </CardTitle>
            <CardDescription className="text-xs">
              {editingUser ? `Modifying profile for "${editingUser.name}"` : "Register a new user into any of the 5 access tiers."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3.5">
              {success && (
                <div className="p-3 text-xs font-semibold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{success}</span>
                </div>
              )}
              {error && (
                <div className="p-3 text-xs font-semibold text-destructive bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-destructive" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="name" className="text-xs">Full Name *</Label>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
                  <Input
                    id="name"
                    placeholder="e.g. Dr. Rajesh Kumar"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-9 h-9 text-xs"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="email" className="text-xs">Mail ID / Login ID *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="e.g. rajesh@iitm.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9 h-9 text-xs"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="phone" className="text-xs">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
                  <Input
                    id="phone"
                    placeholder="e.g. +91 98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="pl-9 h-9 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="password" className="text-xs">{editingUser ? "New Password (leave blank to keep)" : "Password *"}</Label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
                  <Input
                    id="password"
                    type="password"
                    placeholder={editingUser ? "Keep existing password" : "••••••••"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 h-9 text-xs"
                    required={!editingUser}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="role" className="text-xs">Access Tier *</Label>
                  <Select
                    id="role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full bg-background border h-9 text-xs"
                  >
                    <option value="intern">1. Intern</option>
                    <option value="engineer">2. Engineer</option>
                    <option value="auditor">3. Auditor</option>
                    <option value="hr">4. HR</option>
                    <option value="admin">5. Admin</option>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="status" className="text-xs">Account Status</Label>
                  <Select
                    id="status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full bg-background border h-9 text-xs"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="designation" className="text-xs">Designation / Title</Label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
                  <Input
                    id="designation"
                    placeholder="e.g. Lead Energy Auditor"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="pl-9 h-9 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="department" className="text-xs">Department</Label>
                <div className="relative">
                  <Building className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
                  <Input
                    id="department"
                    placeholder="e.g. Energy Auditing"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="pl-9 h-9 text-xs"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full mt-2 cursor-pointer font-semibold h-9 text-xs"
                disabled={loading}
              >
                {loading ? (editingUser ? "Saving..." : "Registering...") : (editingUser ? "Save Changes" : "Create Account")}
              </Button>

              {editingUser && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full mt-1.5 cursor-pointer font-semibold text-muted-foreground h-9 text-xs"
                  onClick={cancelEdit}
                >
                  Cancel Edit
                </Button>
              )}
            </form>
          </CardContent>
        </Card>

        {/* Users List Table */}
        <Card className="md:col-span-2 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  Registered Staff Directory
                </CardTitle>
                <CardDescription className="text-xs">
                  {users.length} active employee profiles across all 5 access tiers.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table className="min-w-[650px] sm:min-w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Mail ID / Login ID</TableHead>
                    <TableHead>Access Tier</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Actions (ARMD)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="font-semibold text-foreground text-xs">{u.name}</div>
                        <div className="text-[10px] text-muted-foreground">{u.designation || 'Staff'} · {u.phone || 'No phone'}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{u.email}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            u.role === "admin" ? "success" : 
                            u.role === "hr" ? "warning" : 
                            u.role === "auditor" ? "default" :
                            u.role === "engineer" ? "outline" : "secondary"
                          }
                          className="capitalize text-[10px] font-semibold"
                        >
                          {u.role === "admin" ? "Admin" : 
                           u.role === "hr" ? "HR" : 
                           u.role === "auditor" ? "Auditor" : 
                           u.role === "engineer" ? "Engineer" : "Intern"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{u.department || 'General'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end items-center gap-1">
                          {/* Leave Quota Customization Button */}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-[10px] gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50 cursor-pointer font-medium"
                            title={`Customize Leave Quotas for ${u.name}`}
                            onClick={() => setQuotaEmployee(u)}
                          >
                            <Umbrella className="w-3.5 h-3.5 text-amber-500" />
                            Quota
                          </Button>

                          {/* Edit User Button */}
                          {isPrimaryAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10 cursor-pointer"
                              title={`Edit profile for ${u.name}`}
                              onClick={() => startEdit(u)}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </Button>
                          )}

                          {/* Delete User Button */}
                          {u.email !== 'admin' && String(u.id) !== String(currentUser?.id) ? (
                            <>
                              {confirmDeleteId === u.id && (
                                <span className="text-[10px] font-bold text-destructive animate-pulse">Confirm?</span>
                              )}
                              <Button
                                size="sm"
                                variant={confirmDeleteId === u.id ? "destructive" : "ghost"}
                                className={`h-7 transition-all cursor-pointer font-semibold ${
                                  confirmDeleteId === u.id ? "px-2 text-xs" : "w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                }`}
                                title={confirmDeleteId === u.id ? "Click again to confirm delete" : `Remove ${u.name}`}
                                onClick={() => handleDelete(u.id, u.name)}
                              >
                                {confirmDeleteId === u.id ? "Yes" : <Trash2 className="w-3.5 h-3.5" />}
                              </Button>
                            </>
                          ) : (
                            !isPrimaryAdmin && <span className="text-[10px] text-muted-foreground/40 italic pr-1">—</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-xs">
                        No registered users found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Data Maintenance (Admin Only) */}
      <Card className="shadow-sm border-l-4 border-l-amber-500 mt-6">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Database className="w-5 h-5 text-amber-500" />
            System Data Maintenance (Admin Only)
          </CardTitle>
          <CardDescription className="text-xs">
            Export booking histories or purge legacy data archives with audit logging.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Extract Bookings */}
            <div className="space-y-3 p-4 rounded-xl border bg-muted/20">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Download className="w-4 h-4 text-primary" /> Extract Booking Records
              </h4>
              <p className="text-xs text-muted-foreground">Download booking spreadsheet for a date range.</p>
              <form onSubmit={handleExtract} className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px]">Start Date</Label>
                    <Input type="date" value={extractStart} onChange={e => setExtractStart(e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px]">End Date</Label>
                    <Input type="date" value={extractEnd} onChange={e => setExtractEnd(e.target.value)} className="h-8 text-xs" />
                  </div>
                </div>
                <Button type="submit" size="sm" className="w-full h-8 text-xs gap-1.5 font-semibold">
                  <Download className="w-3.5 h-3.5" /> Download Spreadsheet
                </Button>
              </form>
            </div>

            {/* Clear Bookings */}
            <div className="space-y-3 p-4 rounded-xl border bg-muted/20">
              <h4 className="text-sm font-semibold flex items-center gap-1.5 text-destructive">
                <AlertTriangle className="w-4 h-4 text-destructive" /> Clear Booking History
              </h4>
              <p className="text-xs text-muted-foreground">Purge historical records within a specified range.</p>
              <form onSubmit={handleClear} className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px]">Start Date (Optional)</Label>
                    <Input type="date" value={clearStart} onChange={e => setClearStart(e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px]">End Date (Optional)</Label>
                    <Input type="date" value={clearEnd} onChange={e => setClearEnd(e.target.value)} className="h-8 text-xs" />
                  </div>
                </div>
                <Button 
                  type="submit" 
                  size="sm" 
                  variant={confirmClear ? "destructive" : "outline"} 
                  className="w-full h-8 text-xs font-semibold text-destructive border-destructive/30"
                >
                  {confirmClear ? "Confirm Purge Now?" : "Clear Records"}
                </Button>
              </form>
            </div>
          </div>
          {systemSuccess && <p className="text-xs text-emerald-600 mt-3 font-semibold">{systemSuccess}</p>}
          {systemError && <p className="text-xs text-destructive mt-3 font-semibold">{systemError}</p>}
        </CardContent>
      </Card>

      {/* Leave Quota Customization Modal */}
      {quotaEmployee && (
        <EmployeeLeaveQuotaModal 
          employee={quotaEmployee} 
          onClose={() => setQuotaEmployee(null)} 
        />
      )}
    </div>
  )
}
