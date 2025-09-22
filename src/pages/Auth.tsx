import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

import { auth, db, functions } from "@/firebaseConfig";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

/**
 * Backend helper (Cloud Function you should add if not present yet):
 *
 * export const resolveLoginEmail = functions.https.onCall(async (data) => {
 *   const loginId = (data?.loginId || "").trim();
 *   if (!loginId) throw new functions.https.HttpsError("invalid-argument", "loginId required");
 *   const snap = await admin.firestore().collection("users").where("loginId","==",loginId).limit(1).get();
 *   if (snap.empty) throw new functions.https.HttpsError("not-found", "User not found");
 *   const u = snap.docs[0].data();
 *   return { email: u.email };
 * });
 */

export default function Auth() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function resolveEmailFromLoginId(id: string): Promise<string> {
    // If user typed an email directly, accept it
    if (id.includes("@")) return id;

    // Else map Login ID -> email via callable
    const fn = httpsCallable(functions, "resolveLoginEmail");
    const res: any = await fn({ loginId: id });
    const email = res?.data?.email;
    if (!email) {
      throw new Error("Account not found for the given Login ID");
    }
    return email;
  }

  async function fetchAndSetRoleAndRedirect(uid: string) {
    try {
      const userDoc = await getDoc(doc(db, "users", uid));
      const data = userDoc.data() as any;
      const role = (data?.role || "").toUpperCase();
      if (!role) {
        toast({ title: "No role found for user", variant: "destructive" });
        return;
      }
      localStorage.setItem("role", role);

      // Redirect by role
      if (role === "ADMIN") navigate("/dashboard/admin", { replace: true });
      else if (role === "FACULTY") navigate("/dashboard/faculty", { replace: true });
      else if (role === "STUDENT") navigate("/dashboard/student", { replace: true });
      else navigate("/", { replace: true });
    } catch (e: any) {
      toast({ title: "Failed to load user profile", description: e.message, variant: "destructive" });
    }
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
      const message = err?.message || "Login failed";
      toast({ title: "Login failed", description: message, variant: "destructive" });
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
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
