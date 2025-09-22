import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

import { auth, db, functions } from "@/firebaseConfig";
import { signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

/**
 * Optional backend helper (callable):
 *   resolveLoginEmail(loginId) -> { email }
 * If you don’t have it yet, add a small Cloud Function that maps loginId -> email from Firestore.
 */

export default function Auth() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // If already signed-in with a role in localStorage, bounce to their dashboard
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      const role = localStorage.getItem("role");
      if (user && role) {
        if (role === "ADMIN") navigate("/dashboard/admin", { replace: true });
        else if (role === "FACULTY") navigate("/dashboard/faculty", { replace: true });
        else if (role === "STUDENT") navigate("/dashboard/student", { replace: true });
      }
    });
    return () => unsub();
  }, [navigate]);

  async function resolveEmailFromLoginId(id: string): Promise<string> {
    // If it's already an email, just use it.
    if (id.includes("@")) return id;

    // Else call backend to map loginId -> email
    const fn = httpsCallable(functions, "resolveLoginEmail");
    const res: any = await fn({ loginId: id });
    const email = res?.data?.email;
    if (!email) throw new Error("Account not found for the given Login ID");
    return email;
  }

  async function fetchAndSetRoleAndRedirect(uid: string) {
    const snap = await getDoc(doc(db, "users", uid));
    const data = snap.data() as any;
    const role = (data?.role || "").toUpperCase();
    if (!role) {
      toast({ title: "No role found for user", variant: "destructive" });
      return;
    }
    localStorage.setItem("role", role);

    if (role === "ADMIN") navigate("/dashboard/admin", { replace: true });
    else if (role === "FACULTY") navigate("/dashboard/faculty", { replace: true });
    else if (role === "STUDENT") navigate("/dashboard/student", { replace: true });
    else navigate("/", { replace: true });
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginId.trim() || !password.trim()) {
      toast({ title: "Please enter Login ID and Password", variant: "destructive" });
      return;
    }

    try {
      setBusy(true);
      const email = await resolveEmailFromLoginId(loginId.trim());
      const cred = await signInWithEmailAndPassword(auth, email, password);
      toast({ title: "Signed in successfully" });
      await fetchAndSetRoleAndRedirect(cred.user.uid);
    } catch (err: any) {
      toast({
        title: "Login failed",
        description: err?.message || "Please check your credentials",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to AI-LAB</CardTitle>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="loginId">Login ID (or Email)</Label>
              <Input
                id="loginId"
                placeholder="e.g. A0001 or you@sastra.ac.in"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <div className="flex items-center justify-between">
              <div />
              <Link to="/forgot" className="text-sm text-primary hover:underline">
                Forgot password?
              </Link>
            </div>

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Signing in..." : "Sign In"}
            </Button>

            {/* NEW: clear way to reach Sign Up */}
            <div className="mt-4 text-center text-sm">
              <span className="text-muted-foreground">New user? </span>
              <Link to="/signup" className="text-primary hover:underline">
                Create an account
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
