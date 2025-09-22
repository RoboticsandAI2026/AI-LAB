import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebaseConfig";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

export default function ForgotVerify() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [otp, setOtp] = useState("");
  const [emailMasked, setEmailMasked] = useState("");
  const [busy, setBusy] = useState(false);

  const validatePasswordOtp = httpsCallable(functions, "validatePasswordOtp");

  useEffect(() => {
    const sessionId = sessionStorage.getItem("fp.sessionId");
    const emailMasked = sessionStorage.getItem("fp.emailMasked");
    if (!sessionId || !emailMasked) {
      navigate("/forgot");
      return;
    }
    setEmailMasked(emailMasked);
  }, [navigate]);

  const handleVerify = async () => {
    const sessionId = sessionStorage.getItem("fp.sessionId");
    if (!sessionId) {
      navigate("/forgot");
      return;
    }
    if (!/^\d{6}$/.test(otp)) {
      toast({ variant: "destructive", title: "Invalid OTP", description: "Enter the 6-digit code from your email." });
      return;
    }
    setBusy(true);
    try {
      const res: any = await validatePasswordOtp({ sessionId, otp });
      const { ticketId } = res.data;

      // Pass to next step
      sessionStorage.setItem("fp.ticketId", ticketId);
      sessionStorage.removeItem("fp.sessionId"); // session consumed

      navigate("/forgot/reset");
    } catch (err: any) {
      console.error("[validatePasswordOtp] failed", err);
      const msg = err?.message || err?.code || "Could not verify code.";
      toast({ variant: "destructive", title: "Verification failed", description: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <CardTitle>Verify OTP</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">We sent a 6-digit code to <strong>{emailMasked}</strong></p>
          <div>
            <Label>Enter OTP</Label>
            <Input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit code"
              inputMode="numeric"
            />
          </div>
          <Button className="w-full" onClick={handleVerify} disabled={busy}>
            {busy ? "Verifying…" : "Verify code"}
          </Button>

          <div className="text-sm text-center">
            <button className="underline" onClick={() => navigate("/forgot")}>Back</button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
