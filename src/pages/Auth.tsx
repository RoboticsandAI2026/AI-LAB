import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

import { auth, db } from "@/firebaseConfig";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

export default function Auth() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // --- Login form ---
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const handlePasswordLogin = async () => {
    const id = loginId.trim();
    if (!id) {
      toast({ variant: "destructive", title: "Login ID required", description: "Enter your Login ID to continue." });
      return;
    }
    if (!password) {
      toast({ variant: "destructive", title: "Password required", description: "Enter your password to continue." });
      return;
    }

    setBusy(true);
    try {
      // map loginId -> { email, uid }
      const lookupSnap = await getDoc(doc(db, "loginLookup", id));
      if (!lookupSnap.exists()) {
        toast({ variant: "destructive", title: "No account", description: `No user found for ${id}.` });
        setBusy(false);
        return;
      }
      const { email } = lookupSnap.data() as { email: string; uid: string };

      await signInWithEmailAndPassword(auth, email, password);

      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("Signed in, but no Auth UID found.");
      const profSnap = await getDoc(doc(db, "users", uid));
      if (!profSnap.exists()) throw new Error("Profile not found.");

      const profile = profSnap.data() as any;
      localStorage.setItem("name", profile.name || "");
      localStorage.setItem("email", profile.email || email);
      localStorage.setItem("loginId", profile.loginId || id);
      localStorage.setItem("role", profile.role || "");

      if (profile.role === "ADMIN") navigate("/dashboard/admin");
      else if (profile.role === "FACULTY") navigate("/dashboard/faculty");
      else navigate("/dashboard/student");
    } catch (err: any) {
      console.error("[login] failed", err);
      toast({
        variant: "destructive",
        title: "Login failed",
        description: err?.message || "Check your Login ID and password.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <CardTitle>Log In</CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* LOGIN FORM */}
          <div>
            <div className="flex items-center justify-between">
              <Label>Login ID</Label>
              {/* Link to multi-page forgot flow */}
              <button
                type="button"
                onClick={() => navigate("/forgot")}
                className="text-sm underline text-primary hover:opacity-80"
              >
                Forgot password?
              </button>
            </div>
            <Input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="e.g., 126179012 or F3210 or A0001"
            />
          </div>

          <div>
            <Label>Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <Button className="w-full" onClick={handlePasswordLogin} disabled={busy}>
            {busy ? "Logging in…" : "Log In"}
          </Button>

          <div className="text-sm text-center">
            Don’t have an account?{" "}
            <button className="underline" onClick={() => navigate("/signup")}>
              Sign up
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
