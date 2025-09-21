import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

import { auth, db } from "../firebaseConfig";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const handlePasswordLogin = async () => {
    setBusy(true);
    try {
      // Map loginId -> { email, uid }
      const lookupSnap = await getDoc(doc(db, "loginLookup", loginId));
      if (!lookupSnap.exists()) {
        toast({
          variant: "destructive",
          title: "No account",
          description: `No user found for ${loginId}.`,
        });
        setBusy(false);
        return;
      }
      const { email } = lookupSnap.data() as { email: string; uid: string };

      await signInWithEmailAndPassword(auth, email, password);

      const currentUid = auth.currentUser?.uid;
      if (!currentUid) throw new Error("Signed in, but no auth user UID found.");

      const profSnap = await getDoc(doc(db, "users", currentUid));
      if (!profSnap.exists()) throw new Error("Profile not found.");

      const profile = profSnap.data() as any;

      localStorage.setItem("name", profile.name || "");
      localStorage.setItem("email", profile.email || email);
      localStorage.setItem("loginId", profile.loginId || loginId);
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
          <div>
            <Label>Login ID</Label>
            <Input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="S123456 / F6789 / A0001"
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
};

export default Auth;
