import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

import { auth, db, functions } from "../firebaseConfig";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Login form
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // Forgot flow
  const [showReset, setShowReset] = useState(false);
  const [resetLoginId, setResetLoginId] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [emailMasked, setEmailMasked] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [otp, setOtp] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busyReset, setBusyReset] = useState(false);

  const handlePasswordLogin = async () => {
    setBusy(true);
    try {
      const lookupSnap = await getDoc(doc(db, "loginLookup", loginId));
      if (!lookupSnap.exists()) {
        toast({ variant: "destructive", title: "No account", description: `No user found for ${loginId}.` });
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
      localStorage.setItem("loginId", profile.loginId || loginId);
      localStorage.setItem("role", profile.role || "");

      if (profile.role === "ADMIN") navigate("/dashboard/admin");
      else if (profile.role === "FACULTY") navigate("/dashboard/faculty");
      else navigate("/dashboard/student");
    } catch (err: any) {
      console.error("[login] failed", err);
      toast({ variant: "destructive", title: "Login failed", description: err?.message || "Check your Login ID and password." });
    } finally {
      setBusy(false);
    }
  };

  // ---- Forgot password (OTP) ----
  const callSendOtp = httpsCallable(functions, "sendPasswordOtp");
  const callVerifyOtp = httpsCallable(functions, "verifyPasswordOtp");

  const startForgot = () => {
    setShowReset(true);
    setResetLoginId(loginId || "");
    setOtpSent(false);
    setEmailMasked("");
    setSessionId("");
    setOtp("");
    setNewPass("");
    setConfirm("");
  };

  const handleSendOtp = async () => {
    if (!resetLoginId.trim()) {
      toast({ variant: "destructive", title: "Login ID required", description: "Enter your Login ID to receive OTP." });
      return;
    }
    setBusyReset(true);
    try {
      const res: any = await callSendOtp({ loginId: resetLoginId.trim() });
      setSessionId(res.data.sessionId);
      setEmailMasked(res.data.emailMasked);
      setOtpSent(true);
      toast({ title: "OTP sent", description: `We emailed a 6-digit code to ${res.data.emailMasked}` });
    } catch (err: any) {
      console.error("[send otp] failed", err);
      toast({ variant: "destructive", title: "Could not send OTP", description: err?.message || err?.code || "Try again." });
    } finally {
      setBusyReset(false);
    }
  };

  const handleResetPassword = async () => {
    if (!/^\d{6}$/.test(otp)) {
      toast({ variant: "destructive", title: "Invalid OTP", description: "Enter the 6-digit code from your email." });
      return;
    }
    if (newPass.length < 8) {
      toast({ variant: "destructive", title: "Weak password", description: "Minimum 8 characters." });
      return;
    }
    if (newPass !== confirm) {
      toast({ variant: "destructive", title: "Password mismatch", description: "Passwords do not match." });
      return;
    }
    setBusyReset(true);
    try {
      const res: any = await callVerifyOtp({ sessionId, otp, newPassword: newPass });
      if (res?.data?.ok) {
        toast({ title: "Password updated", description: "You can now log in with your new password." });
        setShowReset(false);
      } else {
        throw new Error("Unexpected response");
      }
    } catch (err: any) {
      console.error("[verify otp] failed", err);
      toast({ variant: "destructive", title: "Could not reset", description: err?.message || err?.code || "Try again." });
    } finally {
      setBusyReset(false);
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

          <div className="flex items-center justify-between">
            <Button className="w-[48%]" onClick={handlePasswordLogin} disabled={busy}>
              {busy ? "Logging in…" : "Log In"}
            </Button>
            <button className="underline text-sm" onClick={startForgot}>Forgot password?</button>
          </div>

          <div className="text-sm text-center">
            Don’t have an account?{" "}
            <button className="underline" onClick={() => navigate("/signup")}>Sign up</button>
          </div>

          {/* -------- Forgot password panel -------- */}
          {showReset && (
            <div className="mt-6 border rounded p-3 space-y-3">
              <h3 className="font-medium">Reset password</h3>

              {!otpSent ? (
                <>
                  <div>
                    <Label>Login ID</Label>
                    <Input
                      value={resetLoginId}
                      onChange={(e) => setResetLoginId(e.target.value)}
                      placeholder="Your Login ID"
                    />
                  </div>
                  <Button onClick={handleSendOtp} disabled={busyReset}>
                    {busyReset ? "Sending…" : "Send OTP to email"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    We’ll email a 6-digit code to the address linked with this Login ID.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm">OTP sent to <strong>{emailMasked}</strong></p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Enter OTP</Label>
                      <Input
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0,6))}
                        placeholder="6-digit code"
                        inputMode="numeric"
                      />
                    </div>
                    <div>
                      <Label>New password</Label>
                      <Input
                        type="password"
                        value={newPass}
                        onChange={(e) => setNewPass(e.target.value)}
                        placeholder="Min 8 chars"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Confirm password</Label>
                    <Input
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Re-enter password"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={handleResetPassword} disabled={busyReset || !sessionId}>
                      {busyReset ? "Updating…" : "Reset password"}
                    </Button>
                    <button className="text-sm underline" onClick={() => setShowReset(false)}>Cancel</button>
                  </div>
                  <p className="text-xs text-muted-foreground">Code expires in 10 minutes.</p>
                </>
              )}
            </div>
          )}
          {/* -------- End forgot password panel -------- */}
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
