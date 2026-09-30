import React, { useState, useEffect } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import {
  ShieldAlert,
  KeyRound,
  Mail,
  Sparkles,
  Eye,
  EyeOff,
  Clock,
  Smartphone,
  Download,
  CheckCircle2,
  Share,
  PlusSquare
} from "lucide-react"

export default function LoginView({ onLoginSuccess }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [sessionExpiredMsg, setSessionExpiredMsg] = useState(() => {
    const msg = sessionStorage.getItem("iitm_session_expired_message")
    if (msg) {
      sessionStorage.removeItem("iitm_session_expired_message")
      return msg
    }
    return ""
  })
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isStandalone, setIsStandalone] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [showInstallGuide, setShowInstallGuide] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    // Check if app is launched in standalone mode
    const checkStandalone = () => {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true ||
        document.referrer.includes("android-app://")
      setIsStandalone(standalone)
    }
    checkStandalone()

    // Detect iOS
    const ua = window.navigator.userAgent.toLowerCase()
    setIsIOS(/iphone|ipad|ipod/.test(ua))

    // Listen for PWA installation prompt
    const handlePrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    const handleInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
    }

    window.addEventListener("beforeinstallprompt", handlePrompt)
    window.addEventListener("appinstalled", handleInstalled)

    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt)
      window.removeEventListener("appinstalled", handleInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === "accepted") {
        setIsInstalled(true)
      }
      setDeferredPrompt(null)
    } else {
      setShowInstallGuide(true)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setSessionExpiredMsg("")
    setLoading(true)

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email: email.trim(), password })
      })

      const data = await res.json()

      if (res.ok) {
        onLoginSuccess(data)
      } else {
        setError(data.error || "Login failed. Please check your credentials.")
      }
    } catch (err) {
      console.error("Login request failed", err)
      setError("Unable to connect to the server. Please try again.")
    } finally {
      document.body.style.cursor = "default"
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-primary/5 p-4">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />
      
      <Card className="w-full max-w-md border shadow-2xl relative bg-card/85 backdrop-blur-md overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary via-indigo-500 to-purple-500" />
        
        <CardHeader className="text-center pt-8 pb-4">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img
              src="https://lh3.googleusercontent.com/d/1Y1tT7mrE-ntA-cY5xpewNdIp3sGXxO6F"
              alt="IITM Logo"
              className="h-12 w-auto object-contain bg-white rounded-lg p-1 shadow-md"
            />
            <img
              src="https://lh3.googleusercontent.com/d/1_h0FAF9gosStf26KKGPOqPBdGozZdPCr"
              alt="IEAC Logo"
              className="h-12 w-auto object-contain bg-white rounded-lg p-1 shadow-md"
            />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-foreground">IITM IEAC</CardTitle>
          <CardDescription className="text-muted-foreground font-medium mt-1">Asset &amp; Workforce Management</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {sessionExpiredMsg && (
              <div className="p-3 text-xs font-medium text-amber-800 dark:text-amber-200 bg-amber-500/15 border border-amber-500/30 rounded-lg flex items-center gap-2">
                <Clock className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>{sessionExpiredMsg}</span>
              </div>
            )}

            {error && (
              <div className="p-3 text-xs font-semibold text-destructive bg-destructive/15 rounded-lg flex items-center gap-2 animate-shake">
                <ShieldAlert className="w-4 h-4 shrink-0 text-destructive" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">Mail ID</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
                <Input
                  id="email"
                  type="text"
                  placeholder="e.g. admin or test@engineer.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10 h-10 w-full"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">Password</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/60" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 h-10 w-full"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-muted-foreground/60 hover:text-foreground focus:outline-none cursor-pointer"
                  disabled={loading}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-10 font-semibold bg-primary hover:bg-primary/95 text-primary-foreground shadow-md transition-all mt-4 flex items-center justify-center gap-2 cursor-pointer"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  <span>Logging in...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Access Account</span>
                </>
              )}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 text-center pb-6 pt-0">
          {/* Small & Neat PWA Install Option */}
          {!isStandalone && !isInstalled && (
            <div className="w-full bg-muted/40 hover:bg-muted/60 border rounded-xl p-2.5 transition-all flex items-center justify-between gap-3 text-left">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-foreground leading-tight">Install Web App</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">1-click standalone desktop / mobile app</p>
                </div>
              </div>

              <Button
                type="button"
                size="sm"
                onClick={handleInstallClick}
                className="h-7 px-3 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 shadow-xs cursor-pointer gap-1.5"
              >
                <Download className="w-3 h-3" />
                <span>Install</span>
              </Button>
            </div>
          )}

          {isStandalone && (
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-lg py-1.5 px-3 w-full">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Running as Installed Application</span>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground/80 font-medium">
            Contact your administrator if you do not have credentials.
          </p>
        </CardFooter>
      </Card>

      {/* PWA Install Guide Modal (iOS & Desktop Fallback) */}
      <Dialog open={showInstallGuide} onOpenChange={setShowInstallGuide}>
        <DialogContent className="max-w-sm sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Smartphone className="w-5 h-5 text-primary" />
              Install IITM IEAC App
            </DialogTitle>
            <DialogDescription className="text-xs">
              Install the application onto your home screen or desktop for fast 1-click access and offline capability.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            {isIOS ? (
              <div className="space-y-2 rounded-lg bg-muted/40 p-3 border">
                <p className="font-semibold text-foreground">On iOS Safari:</p>
                <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
                  <li>Tap the <strong>Share</strong> button <Share className="w-3.5 h-3.5 inline mx-1 text-primary" /> at the bottom of Safari.</li>
                  <li>Scroll down and tap <strong>"Add to Home Screen"</strong> <PlusSquare className="w-3.5 h-3.5 inline mx-1" />.</li>
                  <li>Tap <strong>"Add"</strong> in the top right corner.</li>
                </ol>
              </div>
            ) : (
              <div className="space-y-2 rounded-lg bg-muted/40 p-3 border">
                <p className="font-semibold text-foreground">On Chrome, Edge, or Android:</p>
                <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
                  <li>Look for the <strong>Install</strong> icon <Download className="w-3.5 h-3.5 inline mx-1 text-primary" /> in your browser address bar.</li>
                  <li>Or open the browser menu (<strong>⋮</strong> or <strong>⋯</strong>) and click <strong>"Install IITM IEAC..."</strong> or <strong>"Add to Home Screen"</strong>.</li>
                  <li>Confirm by clicking <strong>Install</strong>.</li>
                </ol>
              </div>
            )}

            <div className="rounded-lg bg-primary/5 border border-primary/20 p-2.5 flex items-center gap-2 text-[11px] text-primary">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-primary" />
              <span>Once installed, the app launches instantly in full-screen standalone mode without any browser URL bars.</span>
            </div>
          </div>

          <DialogFooter>
            <Button size="sm" onClick={() => setShowInstallGuide(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
