import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebaseConfig";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

export default function ForgotStart() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loginId, setLoginId] = useState("");
  const [busy, setBusy] = useState(false);

  const sendPasswordOtp = httpsCallable(functions, "sendPasswordOtp");

  const handleSend = async () => {
    if (!loginId.trim()) {
      toast({ variant: "destructive", title: "Login ID required" });
      return;
    }
    setBusy(true);
    try {
      const res: any = await sendPasswordOtp({ loginId: loginId.trim() });
      const { sessionId, emailMasked } = res.data;

      // Persist for next step
      sessionStorage.setItem("fp.sessionId", sessionId);
      sessionStorage.setItem("fp.emailMasked", emailMasked);
      sessionStorage.setItem("fp.loginId", loginId.trim());

      navigate("/forgot/verify");
    } catch (err: any) {
      console.error("[sendPasswordOtp] failed", err);
      toast({ variant: "destructive", title: "Could not send OTP", description: err?.message || err?.code || "Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <CardTitle>Reset password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Login ID</Label>
            <Input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="e.g., 126179012 or F3210"
            />
          </div>
          <Button className="w-full" onClick={handleSend} disabled={busy}>
            {busy ? "Sending…" : "Send OTP to email"}
          </Button>

          <div className="text-sm text-center">
            <button className="underline" onClick={() => navigate("/auth")}>Back to login</button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
