import React, { useState, useEffect, useRef } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Plus,
  Edit3,
  Trash2,
  Download,
  Building,
  Search,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  User,
  MapPin,
  FileText,
  Briefcase,
  Layers,
  Check,
  ChevronsUpDown,
  ArrowUpDown,
  Phone,
  Mail,
  Globe,
  Settings,
  Info
} from "lucide-react"

export default function VendorManagementView({ currentUserRole }) {
  const isAdmin = (currentUserRole || "").toLowerCase() === "admin"

  // Core States
  const [vendors, setVendors] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [utilities, setUtilities] = useState([])

  // Search & Filter Panel States
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedUtility, setSelectedUtility] = useState("")
  const [selectedVendorFilter, setSelectedVendorFilter] = useState("")
  const [selectedProductFilter, setSelectedProductFilter] = useState("")

  // Sort State
  const [sortBy, setSortBy] = useState("name")
  const [sortOrder, setSortOrder] = useState("asc")

  // Checkbox/Selection State for Exports
  const [selectedVendorIds, setSelectedVendorIds] = useState([])

  // UI Notification State
  const [notification, setNotification] = useState(null) // { message, type: 'success' | 'error' }

  // Vendor Modals
  const [vendorFormOpen, setVendorFormOpen] = useState(false)
  const [editingVendor, setEditingVendor] = useState(null)
  const [vendorFormData, setVendorFormData] = useState({
    name: "", companyName: "", vendorType: "Manufacturer", status: "Active",
    contactPerson: "", mobileNumber: "", alternativeMobileNumber: "", email: "", website: "",
    streetAddress: "", city: "", state: "", country: "", pinCode: "",
    gstin: "", pan: "", businessRegNo: "",
    remarks: ""
  })

  // Product Modals (within Vendor Profile)
  const [activeVendorProfile, setActiveVendorProfile] = useState(null) // vendor object
  const [productFormOpen, setProductFormOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [productFormData, setProductFormData] = useState({
    name: "", description: "", category: "", brand: "",
    productStatus: "Active", utilityName: ""
  })

  // Utility Creation Modals
  const [newUtilityName, setNewUtilityName] = useState("")
  const [utilityModalOpen, setUtilityModalOpen] = useState(false)

  // Autocomplete state for utilities
  const [utilitySuggestions, setUtilitySuggestions] = useState([])
  const [showUtilitySuggestions, setShowUtilitySuggestions] = useState(false)

  // Confirm Delete
  const [deleteConfirm, setDeleteConfirm] = useState(null) // { type: 'vendor' | 'product', id, parentVendorId }

  const showNotification = (message, type = "success") => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 4000)
  }

  // Load Utilities
  const loadUtilities = async () => {
    try {
      const res = await fetch("/api/utilities")
      if (res.ok) {
        const data = await res.json()
        setUtilities(data)
      }
    } catch (err) {
      console.error("Failed to load utilities", err)
    }
  }

  // Load Vendors (Server-side paginated & filtered)
  const loadVendors = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: currentPage,
        limit: 10,
        q: searchQuery,
        utility: selectedUtility,
        vendor: selectedVendorFilter,
        product: selectedProductFilter
      })
      const res = await fetch(`/api/vendors?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setVendors(data.vendors)
        setTotalCount(data.total)
        setTotalPages(data.totalPages)
      } else {
        showNotification("Failed to fetch vendors list.", "error")
      }
    } catch (err) {
      console.error(err)
      showNotification("Error loading vendors.", "error")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadVendors()
  }, [currentPage, searchQuery, selectedUtility, selectedVendorFilter, selectedProductFilter])

  useEffect(() => {
    loadUtilities()
  }, [])

  const loadActiveVendorProfile = async (id) => {
    try {
      const res = await fetch(`/api/vendors/${id}`)
      if (res.ok) {
        const data = await res.json()
        setActiveVendorProfile(data)
      }
    } catch (err) {
      console.error("Error loading active vendor profile", err)
    }
  }

  const handleViewVendor = async (v) => {
    setActiveVendorProfile({ ...v, products: v.products || [] })
    await loadActiveVendorProfile(v.id)
  }

  // Handle Sort
  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortBy(field)
      setSortOrder("asc")
    }
  }

  const sortedVendors = [...vendors].sort((a, b) => {
    let aVal = a[sortBy] || ""
    let bVal = b[sortBy] || ""
    if (typeof aVal === "string") {
      aVal = aVal.toLowerCase()
      bVal = bVal.toLowerCase()
    }
    if (aVal < bVal) return sortOrder === "asc" ? -1 : 1
    if (aVal > bVal) return sortOrder === "asc" ? 1 : -1
    return 0
  })

  // Export Selected Vendors
  const handleExport = async () => {
    if (selectedVendorIds.length === 0) {
      showNotification("Please select at least one vendor to export.", "error")
      return
    }
    try {
      setLoading(true)
      const res = await fetch("/api/vendors/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorIds: selectedVendorIds })
      })
      if (!res.ok) throw new Error("Export failed")
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)

      // Detect if user is on iPhone / iPad / iOS Safari
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

      if (isIOS) {
        // iOS Safari workaround: navigate the current window to the blob URL to prompt a native download
        window.location.href = objectUrl;
      } else {
        const a = document.createElement("a")
        a.href = objectUrl
        a.download = "vendors_export.xlsx"
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(objectUrl), 3000)
      }
      showNotification("Selected vendors exported successfully!")
    } catch (err) {
      console.error(err)
      showNotification("Export failed.", "error")
    } finally {
      setLoading(false)
    }
  }

  // Checkbox functions
  const handleSelectVendor = (id) => {
    if (selectedVendorIds.includes(id)) {
      setSelectedVendorIds(selectedVendorIds.filter(x => x !== id))
    } else {
      setSelectedVendorIds([...selectedVendorIds, id])
    }
  }

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedVendorIds(vendors.map(v => v.id))
    } else {
      setSelectedVendorIds([])
    }
  }

  // Vendor CRUD Actions
  const handleOpenAddVendor = () => {
    setEditingVendor(null)
    setVendorFormData({
      name: "", companyName: "", vendorType: "Manufacturer", status: "Active",
      contactPerson: "", mobileNumber: "", alternativeMobileNumber: "", email: "", website: "",
      streetAddress: "", city: "", state: "", country: "", pinCode: "",
      gstin: "", pan: "", businessRegNo: "",
      remarks: ""
    })
    setVendorFormOpen(true)
  }

  const handleOpenEditVendor = (v) => {
    setEditingVendor(v)
    setVendorFormData({ ...v })
    setVendorFormOpen(true)
  }

  const handleVendorSubmit = async (e) => {
    e.preventDefault()
    const method = editingVendor ? "PUT" : "POST"
    const url = editingVendor ? `/api/vendors/${editingVendor.id}` : "/api/vendors"

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vendorFormData)
      })
      const data = await res.json()
      if (res.ok) {
        showNotification(editingVendor ? "Vendor details updated successfully!" : "New vendor added successfully!")
        setVendorFormOpen(false)
        loadVendors()
      } else {
        showNotification(data.error || "Failed to save vendor.", "error")
      }
    } catch (err) {
      console.error(err)
      showNotification("Network error occurred.", "error")
    }
  }

  const confirmDeleteVendor = (id) => {
    setDeleteConfirm({ type: "vendor", id })
  }

  const executeDeleteVendor = async (id) => {
    try {
      const res = await fetch(`/api/vendors/${id}`, { method: "DELETE" })
      if (res.ok) {
        showNotification("Vendor deleted successfully.")
        setDeleteConfirm(null)
        if (activeVendorProfile && activeVendorProfile.id === id) {
          setActiveVendorProfile(null)
        }
        loadVendors()
      } else {
        showNotification("Failed to delete vendor.", "error")
      }
    } catch (err) {
      console.error(err)
      showNotification("Error deleting vendor.", "error")
    }
  }

  // Product CRUD Actions (inside Vendor Detail view)
  const handleOpenAddProduct = () => {
    setEditingProduct(null)
    setProductFormData({
      name: "", description: "", category: "", brand: "",
      productStatus: "Active", utilityName: ""
    })
    setProductFormOpen(true)
  }

  const handleOpenEditProduct = (p) => {
    setEditingProduct(p)
    setProductFormData({ ...p })
    setProductFormOpen(true)
  }

  const handleProductSubmit = async (e) => {
    e.preventDefault()
    const method = editingProduct ? "PUT" : "POST"
    const url = editingProduct 
      ? `/api/vendors/${activeVendorProfile.id}/products/${editingProduct.id}`
      : `/api/vendors/${activeVendorProfile.id}/products`

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(productFormData)
      })
      const data = await res.json()
      if (res.ok) {
        showNotification(editingProduct ? "Product details updated!" : "Product added to vendor profile!")
        setProductFormOpen(false)
        loadVendors()
        loadActiveVendorProfile(activeVendorProfile.id)
      } else {
        showNotification(data.error || "Failed to save product.", "error")
      }
    } catch (err) {
      console.error(err)
      showNotification("Network error saving product.", "error")
    }
  }

  const confirmDeleteProduct = (productId) => {
    setDeleteConfirm({ type: "product", id: productId, parentVendorId: activeVendorProfile.id })
  }

  const executeDeleteProduct = async (productId, vendorId) => {
    try {
      const res = await fetch(`/api/vendors/${vendorId}/products/${productId}`, { method: "DELETE" })
      if (res.ok) {
        showNotification("Product deleted.")
        setDeleteConfirm(null)
        loadVendors()
        loadActiveVendorProfile(vendorId)
      } else {
        showNotification("Failed to delete product.", "error")
      }
    } catch (err) {
      console.error(err)
      showNotification("Error deleting product.", "error")
    }
  }

  // Custom Utility Creation (Admin only)
  const handleCreateUtility = async (e) => {
    e.preventDefault()
    if (!newUtilityName.trim()) return
    try {
      const res = await fetch("/api/utilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newUtilityName })
      })
      const data = await res.json()
      if (res.ok) {
        showNotification(`Utility "${data.name}" created successfully!`)
        setNewUtilityName("")
        setUtilityModalOpen(false)
        loadUtilities()
      } else {
        showNotification(data.error || "Failed to create utility.", "error")
      }
    } catch (err) {
      console.error(err)
      showNotification("Error creating utility.", "error")
    }
  }

  // Autocomplete Suggestions logic
  const handleUtilityInputChange = (value) => {
    setProductFormData(prev => ({ ...prev, utilityName: value }))
    if (value.trim()) {
      const matches = utilities.filter(u => 
        u.name.toLowerCase().includes(value.toLowerCase())
      )
      setUtilitySuggestions(matches)
      setShowUtilitySuggestions(true)
    } else {
      setUtilitySuggestions(utilities)
      setShowUtilitySuggestions(true)
    }
  }

  const selectUtilitySuggestion = (name) => {
    setProductFormData(prev => ({ ...prev, utilityName: name }))
    setShowUtilitySuggestions(false)
  }

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg animate-in fade-in slide-in-from-top-3 duration-300 ${
          notification.type === "error" 
            ? "bg-destructive/15 border-destructive text-destructive" 
            : "bg-emerald-500/15 border-emerald-500 text-emerald-600 dark:text-emerald-400"
        }`}>
          <Info className="w-5 h-5 shrink-0" />
          <span className="text-sm font-semibold">{notification.message}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
            Vendor Directory
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage raw materials, utilities, procurement logs, and vendor partnerships.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <>
              <Button onClick={handleOpenAddVendor} className="shadow-sm font-semibold">
                <Plus className="w-4 h-4 mr-2" /> Add Vendor
              </Button>
              <Button variant="outline" onClick={() => setUtilityModalOpen(true)}>
                <Layers className="w-4 h-4 mr-2" /> Add Utility
              </Button>
            </>
          )}
          <Button
            variant="secondary"
            onClick={handleExport}
            disabled={selectedVendorIds.length === 0}
            className="font-semibold shadow-sm"
          >
            <Download className="w-4 h-4 mr-2" /> Export Selected ({selectedVendorIds.length})
          </Button>
        </div>
      </div>

      {/* Detail Profile Slider-Over (when a vendor is selected for viewing) */}
      {activeVendorProfile && (
        <div className="border bg-card rounded-xl shadow-lg p-6 space-y-6 animate-in slide-in-from-right-4 duration-300">
          <div className="flex items-center justify-between border-b pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Building className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">{activeVendorProfile.name}</h2>
                <p className="text-xs text-muted-foreground">{activeVendorProfile.companyName} • {activeVendorProfile.id}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={() => handleOpenEditVendor(activeVendorProfile)}>
                  <Edit3 className="w-4 h-4 mr-1.5" /> Edit Profile
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => setActiveVendorProfile(null)} className="rounded-full">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Grid Information */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Contact Card */}
            <div className="space-y-3 bg-muted/40 p-4 rounded-lg border">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <User className="w-4 h-4 text-primary" /> Contact Details
              </h3>
              <div className="text-xs space-y-2.5 text-muted-foreground font-medium">
                <div className="flex items-center gap-2">
                  <span className="text-foreground font-semibold">Rep:</span> {activeVendorProfile.contactPerson || "N/A"}
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5" /> {activeVendorProfile.mobileNumber || "N/A"}
                </div>
                {activeVendorProfile.alternativeMobileNumber && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 opacity-70" /> {activeVendorProfile.alternativeMobileNumber} <span className="text-[9px] opacity-60">(Alt)</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5" /> {activeVendorProfile.email || "N/A"}
                </div>
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5" /> {activeVendorProfile.website || "N/A"}
                </div>
              </div>
            </div>

            {/* Address Card */}
            <div className="space-y-3 bg-muted/40 p-4 rounded-lg border">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" /> Address Details
              </h3>
              <div className="text-xs space-y-2 text-muted-foreground font-medium">
                <div>{activeVendorProfile.streetAddress || "N/A"}</div>
                <div>{activeVendorProfile.city || "N/A"}, {activeVendorProfile.state || "N/A"}</div>
                <div>{activeVendorProfile.country || "N/A"} - {activeVendorProfile.pinCode || "N/A"}</div>
              </div>
            </div>

            {/* Business Info Card */}
            <div className="space-y-3 bg-muted/40 p-4 rounded-lg border">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" /> Regulatory Info
              </h3>
              <div className="text-xs space-y-2 text-muted-foreground font-medium">
                <div><span className="text-foreground font-semibold">GSTIN:</span> {activeVendorProfile.gstin || "N/A"}</div>
                <div><span className="text-foreground font-semibold">PAN:</span> {activeVendorProfile.pan || "N/A"}</div>
                <div><span className="text-foreground font-semibold">Reg No:</span> {activeVendorProfile.businessRegNo || "N/A"}</div>
              </div>
            </div>
          </div>

          {/* Remarks/Notes */}
          {activeVendorProfile.remarks && (
            <div className="bg-blue-500/5 border border-blue-500/10 p-3 rounded-lg text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Remarks:</span> {activeVendorProfile.remarks}
            </div>
          )}

          {/* Products Sub-section */}
          <div className="border-t pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-foreground">Offered Products</h3>
                <p className="text-xs text-muted-foreground">List of utility assets supplied by {activeVendorProfile.name}.</p>
              </div>
              {isAdmin && (
                <Button size="sm" onClick={handleOpenAddProduct} className="font-semibold">
                  <Plus className="w-4 h-4 mr-1.5" /> Add Product
                </Button>
              )}
            </div>

            {(!activeVendorProfile.products || activeVendorProfile.products.length === 0) ? (
              <div className="text-center py-10 border border-dashed rounded-lg text-muted-foreground text-sm">
                No products logged for this vendor yet.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border bg-background">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead>Product ID</TableHead>
                      <TableHead>Product Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Assigned Utility</TableHead>
                      <TableHead>Status</TableHead>
                      {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeVendorProfile.products.map(p => (
                      <TableRow key={p.id} className="hover:bg-muted/10 font-medium">
                        <TableCell className="font-mono text-xs text-primary">{p.id}</TableCell>
                        <TableCell>
                          <div className="text-sm font-bold text-foreground">{p.name}</div>
                          {p.description && <div className="text-xs text-muted-foreground font-normal truncate max-w-[200px]">{p.description}</div>}
                        </TableCell>
                        <TableCell className="text-xs">{p.category || "N/A"}</TableCell>
                        <TableCell className="text-xs">
                          {p.brand || "N/A"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-primary/5 text-primary text-[10px] border-primary/20 capitalize font-bold">
                            {p.utilityName || "N/A"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={p.productStatus === "Active" ? "success" : "secondary"} className="text-[10px]">
                            {p.productStatus}
                          </Badge>
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted" onClick={() => handleOpenEditProduct(p)}>
                                <Edit3 className="w-4 h-4 text-muted-foreground" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive" onClick={() => confirmDeleteProduct(p.id)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Advanced Search & Filtering Panel */}
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search vendor, product, utility..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-muted/20"
              />
            </div>

            {/* Product Filter */}
            <div className="relative">
              <Input
                placeholder="Filter by Product Name..."
                value={selectedProductFilter}
                onChange={(e) => setSelectedProductFilter(e.target.value)}
                className="bg-muted/20"
              />
            </div>

            {/* Utility Filter */}
            <div className="relative">
              <select
                value={selectedUtility}
                onChange={(e) => setSelectedUtility(e.target.value)}
                className="w-full h-9 px-3 rounded-md border border-input bg-muted/20 text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
              >
                <option value="">Filter by Utility (All)</option>
                {utilities.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>

            {/* Clear Button */}
            {(searchQuery || selectedUtility || selectedVendorFilter || selectedProductFilter) && (
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSearchQuery("")
                    setSelectedUtility("")
                    setSelectedVendorFilter("")
                    setSelectedProductFilter("")
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground font-semibold"
                >
                  <X className="w-4 h-4 mr-1.5" /> Clear Filters
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Vendors Table Card */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20">
                  <TableHead className="w-12 text-center">
                    <input
                      type="checkbox"
                      className="rounded border-primary text-primary focus:ring-primary cursor-pointer h-4 w-4 accent-primary"
                      onChange={handleSelectAll}
                      checked={vendors.length > 0 && selectedVendorIds.length === vendors.length}
                    />
                  </TableHead>
                  <TableHead onClick={() => handleSort("name")} className="cursor-pointer select-none">
                    <div className="flex items-center gap-1.5 font-bold">
                      Vendor Name <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  </TableHead>
                  <TableHead onClick={() => handleSort("companyName")} className="cursor-pointer select-none">
                    <div className="flex items-center gap-1.5 font-bold">
                      Company <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  </TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Contact Person</TableHead>
                  <TableHead>Products</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-20">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm font-semibold text-muted-foreground">Loading vendors...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : sortedVendors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-20 text-sm text-muted-foreground font-semibold">
                      No vendors match your active filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedVendors.map(v => (
                    <TableRow key={v.id} className="hover:bg-muted/10">
                      <TableCell className="text-center">
                        <input
                          type="checkbox"
                          className="rounded border-primary text-primary focus:ring-primary cursor-pointer h-4 w-4 accent-primary"
                          checked={selectedVendorIds.includes(v.id)}
                          onChange={() => handleSelectVendor(v.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div
                          onClick={() => handleViewVendor(v)}
                          className="font-bold text-foreground hover:text-primary cursor-pointer transition-colors"
                        >
                          {v.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">{v.id}</div>
                      </TableCell>
                      <TableCell className="font-semibold text-foreground">{v.companyName || "N/A"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-semibold">
                          {v.vendorType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-semibold">
                        <div>{v.contactPerson || "N/A"}</div>
                        {v.mobileNumber && <div className="text-[10px] opacity-75">{v.mobileNumber}</div>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-bold text-xs">
                          {v.productCount || 0} Assets
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={v.status === "Active" ? "success" : "secondary"} className="text-[10px]">
                          {v.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleViewVendor(v)} className="text-xs font-semibold hover:bg-muted">
                            View Profile
                          </Button>
                          {isAdmin && (
                            <>
                              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted" onClick={() => handleOpenEditVendor(v)}>
                                <Edit3 className="w-4 h-4 text-muted-foreground" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive" onClick={() => confirmDeleteVendor(v.id)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/10">
              <span className="text-xs font-semibold text-muted-foreground">
                Showing page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* =================================*********
          VENDOR FORM DIALOG
          ========================================= */}
      <Dialog open={vendorFormOpen} onOpenChange={setVendorFormOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVendor ? "Edit Vendor Profile" : "Register New Vendor"}</DialogTitle>
            <DialogDescription>
              Log vendor company records, procurement terms, and registration information.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleVendorSubmit} className="space-y-6 pt-2">
            {/* Basic Info Section */}
            <div className="space-y-4">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-primary border-b pb-1">Basic Information</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="v_name" className="text-xs font-bold text-foreground">Vendor Name *</Label>
                  <Input
                    id="v_name"
                    value={vendorFormData.name}
                    onChange={(e) => setVendorFormData({ ...vendorFormData, name: e.target.value })}
                    placeholder="e.g. Fluke Industrial Corp"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="v_company" className="text-xs font-bold text-foreground">Company Name</Label>
                  <Input
                    id="v_company"
                    value={vendorFormData.companyName}
                    onChange={(e) => setVendorFormData({ ...vendorFormData, companyName: e.target.value })}
                    placeholder="e.g. Fluke India Pvt Ltd"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="v_type" className="text-xs font-bold text-foreground">Vendor Type</Label>
                  <select
                    id="v_type"
                    value={vendorFormData.vendorType}
                    onChange={(e) => setVendorFormData({ ...vendorFormData, vendorType: e.target.value })}
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                  >
                    <option value="Manufacturer">Manufacturer</option>
                    <option value="Distributor">Distributor</option>
                    <option value="Wholesaler">Wholesaler</option>
                    <option value="Service Provider">Service Provider</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="v_status" className="text-xs font-bold text-foreground">Status</Label>
                  <select
                    id="v_status"
                    value={vendorFormData.status}
                    onChange={(e) => setVendorFormData({ ...vendorFormData, status: e.target.value })}
                    className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Contact Info Section */}
            <div className="space-y-4">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-primary border-b pb-1">Contact Information</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="v_contact" className="text-xs font-bold text-foreground">Contact Person</Label>
                  <Input
                    id="v_contact"
                    value={vendorFormData.contactPerson}
                    onChange={(e) => setVendorFormData({ ...vendorFormData, contactPerson: e.target.value })}
                    placeholder="e.g. John Doe"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="v_phone" className="text-xs font-bold text-foreground">Mobile Number</Label>
                  <Input
                    id="v_phone"
                    value={vendorFormData.mobileNumber}
                    onChange={(e) => setVendorFormData({ ...vendorFormData, mobileNumber: e.target.value })}
                    placeholder="e.g. +919876543210"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="v_phone_alt" className="text-xs font-bold text-foreground">Alternative Mobile Number</Label>
                  <Input
                    id="v_phone_alt"
                    value={vendorFormData.alternativeMobileNumber}
                    onChange={(e) => setVendorFormData({ ...vendorFormData, alternativeMobileNumber: e.target.value })}
                    placeholder="e.g. +918877665544"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="v_email" className="text-xs font-bold text-foreground">Email Address</Label>
                  <Input
                    id="v_email"
                    type="email"
                    value={vendorFormData.email}
                    onChange={(e) => setVendorFormData({ ...vendorFormData, email: e.target.value })}
                    placeholder="e.g. support@fluke.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="v_web" className="text-xs font-bold text-foreground">Website (Optional)</Label>
                  <Input
                    id="v_web"
                    value={vendorFormData.website}
                    onChange={(e) => setVendorFormData({ ...vendorFormData, website: e.target.value })}
                    placeholder="e.g. www.fluke.com"
                  />
                </div>
              </div>
            </div>

            {/* Address Details */}
            <div className="space-y-4">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-primary border-b pb-1">Address Details</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor="v_street" className="text-xs font-bold text-foreground">Street Address</Label>
                  <Input
                    id="v_street"
                    value={vendorFormData.streetAddress}
                    onChange={(e) => setVendorFormData({ ...vendorFormData, streetAddress: e.target.value })}
                    placeholder="e.g. 12 Industrial Area Lane"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="v_city" className="text-xs font-bold text-foreground">City</Label>
                  <Input
                    id="v_city"
                    value={vendorFormData.city}
                    onChange={(e) => setVendorFormData({ ...vendorFormData, city: e.target.value })}
                    placeholder="e.g. Chennai"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="v_state" className="text-xs font-bold text-foreground">State</Label>
                  <Input
                    id="v_state"
                    value={vendorFormData.state}
                    onChange={(e) => setVendorFormData({ ...vendorFormData, state: e.target.value })}
                    placeholder="e.g. Tamil Nadu"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="v_country" className="text-xs font-bold text-foreground">Country</Label>
                  <Input
                    id="v_country"
                    value={vendorFormData.country}
                    onChange={(e) => setVendorFormData({ ...vendorFormData, country: e.target.value })}
                    placeholder="e.g. India"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="v_zip" className="text-xs font-bold text-foreground">PIN / ZIP Code</Label>
                  <Input
                    id="v_zip"
                    value={vendorFormData.pinCode}
                    onChange={(e) => setVendorFormData({ ...vendorFormData, pinCode: e.target.value })}
                    placeholder="e.g. 600036"
                  />
                </div>
              </div>
            </div>

            {/* Business Registration Details */}
            <div className="space-y-4">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-primary border-b pb-1">Tax & Regulatory Information</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="v_gstin" className="text-xs font-bold text-foreground">GSTIN (15 chars format)</Label>
                  <Input
                    id="v_gstin"
                    value={vendorFormData.gstin}
                    onChange={(e) => setVendorFormData({ ...vendorFormData, gstin: e.target.value.toUpperCase() })}
                    placeholder="e.g. 33AAAAA1111A1Z1"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="v_pan" className="text-xs font-bold text-foreground">PAN (Optional)</Label>
                  <Input
                    id="v_pan"
                    value={vendorFormData.pan}
                    onChange={(e) => setVendorFormData({ ...vendorFormData, pan: e.target.value.toUpperCase() })}
                    placeholder="e.g. ABCDE1234F"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="v_reg" className="text-xs font-bold text-foreground">Business Registration Number (Optional)</Label>
                  <Input
                    id="v_reg"
                    value={vendorFormData.businessRegNo}
                    onChange={(e) => setVendorFormData({ ...vendorFormData, businessRegNo: e.target.value })}
                    placeholder="e.g. CIN-U12345TN2005PLC000000"
                  />
                </div>
              </div>
            </div>

            {/* Procurement and Remarks */}
            <div className="space-y-4">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-primary border-b pb-1">Procurement & Notes</h4>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="v_remarks" className="text-xs font-bold text-foreground">Remarks / Notes</Label>
                  <Textarea
                    id="v_remarks"
                    value={vendorFormData.remarks}
                    onChange={(e) => setVendorFormData({ ...vendorFormData, remarks: e.target.value })}
                    placeholder="Provide additional details regarding logistics, priority support, etc."
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setVendorFormOpen(false)}>Cancel</Button>
              <Button type="submit" className="font-semibold shadow-sm">Save Profile</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* =================================*********
          PRODUCT FORM DIALOG
          ========================================= */}
      <Dialog open={productFormOpen} onOpenChange={setProductFormOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Edit Product" : "Add Product to Vendor"}</DialogTitle>
            <DialogDescription>
              Assign the product details under this vendor profile.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleProductSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="p_name" className="text-xs font-bold text-foreground">Product Name *</Label>
              <Input
                id="p_name"
                value={productFormData.name}
                onChange={(e) => setProductFormData({ ...productFormData, name: e.target.value })}
                placeholder="e.g. Power Quality Analyzer Probe"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p_category" className="text-xs font-bold text-foreground">Category</Label>
              <Input
                id="p_category"
                value={productFormData.category}
                onChange={(e) => setProductFormData({ ...productFormData, category: e.target.value })}
                placeholder="e.g. Accessories"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p_brand" className="text-xs font-bold text-foreground">Brand</Label>
              <Input
                id="p_brand"
                value={productFormData.brand}
                onChange={(e) => setProductFormData({ ...productFormData, brand: e.target.value })}
                placeholder="e.g. Fluke"
              />
            </div>



            {/* Utility Mapping field with Select Dropdown & Autocomplete & Inline Creation */}
            <div className="space-y-1.5 relative">
              <Label htmlFor="p_utility" className="text-xs font-bold text-foreground">Assigned Utility *</Label>
              <div className="relative">
                <Input
                  id="p_utility"
                  value={productFormData.utilityName}
                  onChange={(e) => handleUtilityInputChange(e.target.value)}
                  onFocus={() => {
                    handleUtilityInputChange(productFormData.utilityName)
                  }}
                  onBlur={() => setTimeout(() => setShowUtilitySuggestions(false), 200)}
                  placeholder="Select or type utility..."
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-0 top-0 h-9 w-9 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={() => {
                    setShowUtilitySuggestions(prev => !prev)
                    if (!showUtilitySuggestions) {
                      setUtilitySuggestions(
                        productFormData.utilityName.trim()
                          ? utilities.filter(u => u.name.toLowerCase().includes(productFormData.utilityName.toLowerCase()))
                          : utilities
                      )
                    }
                  }}
                >
                  <ChevronsUpDown className="w-4 h-4" />
                </button>
              </div>

              {/* Suggestions dropdown */}
              {showUtilitySuggestions && (
                <div className="absolute left-0 right-0 z-50 bg-popover border text-popover-foreground rounded-md shadow-lg max-h-48 overflow-y-auto mt-1 p-1 space-y-1 font-sans">
                  {utilitySuggestions.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground font-medium">No matches found</div>
                  ) : (
                    utilitySuggestions.map(u => (
                      <div
                        key={u.id}
                        onMouseDown={() => selectUtilitySuggestion(u.name)}
                        className="px-3 py-1.5 hover:bg-muted cursor-pointer transition-colors rounded text-xs font-bold flex items-center justify-between"
                      >
                        <span>{u.name}</span>
                        {productFormData.utilityName.toLowerCase() === u.name.toLowerCase() && (
                          <Check className="w-3.5 h-3.5 text-primary" />
                        )}
                      </div>
                    ))
                  )}

                  {/* Inline creation logic for Admin if no exact match exists */}
                  {productFormData.utilityName.trim() && 
                   !utilities.some(u => u.name.toLowerCase() === productFormData.utilityName.toLowerCase().trim()) && (
                    <div className="border-t pt-1 mt-1">
                      {isAdmin ? (
                        <div
                          onMouseDown={async (e) => {
                            e.preventDefault()
                            const newName = productFormData.utilityName.trim()
                            try {
                              const res = await fetch("/api/utilities", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ name: newName })
                              })
                              const data = await res.json()
                              if (res.ok) {
                                showNotification(`Utility "${data.name}" created successfully!`)
                                // Refetch utilities
                                const updatedRes = await fetch("/api/utilities")
                                if (updatedRes.ok) {
                                  const updatedData = await updatedRes.json()
                                  setUtilities(updatedData)
                                }
                                selectUtilitySuggestion(data.name)
                              } else {
                                showNotification(data.error || "Failed to create utility.", "error")
                              }
                            } catch (err) {
                              console.error(err)
                            }
                          }}
                          className="px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary cursor-pointer transition-colors rounded text-xs font-bold text-center"
                        >
                          + Create Utility "{productFormData.utilityName}"
                        </div>
                      ) : (
                        <div className="px-3 py-2 text-muted-foreground text-center text-[10px]">
                          Utility does not exist. (Creation restricted to Admin)
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p_status" className="text-xs font-bold text-foreground">Product Status</Label>
              <select
                id="p_status"
                value={productFormData.productStatus}
                onChange={(e) => setProductFormData({ ...productFormData, productStatus: e.target.value })}
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p_desc" className="text-xs font-bold text-foreground">Product Description</Label>
              <Textarea
                id="p_desc"
                value={productFormData.description}
                onChange={(e) => setProductFormData({ ...productFormData, description: e.target.value })}
                placeholder="Brief specifications or scope of use..."
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setProductFormOpen(false)}>Cancel</Button>
              <Button type="submit" className="font-semibold shadow-sm">Save Product</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* =================================*********
          UTILITY CREATION DIALOG (ADMIN ONLY)
          ========================================= */}
      <Dialog open={utilityModalOpen} onOpenChange={setUtilityModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Create New Utility</DialogTitle>
            <DialogDescription>
              Register a normalized utility class in the system.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateUtility} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="u_new_name" className="text-xs font-bold text-foreground">Utility Name</Label>
              <Input
                id="u_new_name"
                value={newUtilityName}
                onChange={(e) => setNewUtilityName(e.target.value)}
                placeholder="e.g. Pump, Cooling Tower"
                required
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setUtilityModalOpen(false)}>Cancel</Button>
              <Button type="submit" className="font-semibold shadow-sm">Create Utility</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* =================================*********
          DELETE CONFIRMATION DIALOG
          ========================================= */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              Confirm Deletion
            </DialogTitle>
            <DialogDescription className="text-xs font-medium pt-1">
              {deleteConfirm?.type === "vendor" 
                ? "Warning: Deleting this vendor will also cascade and delete all associated products under their profile. This action is permanent."
                : "Are you sure you want to delete this product from the vendor profile? This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-2 flex gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirm.type === "vendor") {
                  executeDeleteVendor(deleteConfirm.id)
                } else {
                  executeDeleteProduct(deleteConfirm.id, deleteConfirm.parentVendorId)
                }
              }}
              className="font-semibold"
            >
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
