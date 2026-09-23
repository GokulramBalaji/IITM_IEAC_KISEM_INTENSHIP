import React, { useState } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ShieldAlert, KeyRound, Mail, Sparkles, Eye, EyeOff } from "lucide-react"

export default function LoginView({ onLoginSuccess }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
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
      
      <Card className="w-full max-w-md border shadow-2xl relative bg-card/75 backdrop-blur-md overflow-hidden animate-in fade-in zoom-in duration-300">
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
          <CardDescription className="text-muted-foreground font-medium mt-1">Asset Management System Login</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
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

        <CardFooter className="flex flex-col gap-2 text-center pb-8 pt-2">
          <p className="text-[11px] text-muted-foreground/80 font-medium">
            Contact your administrator if you do not have credentials.
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
