import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { apiRequestOTP } from "@/lib/resetService";

export default function ForgotPassword() {
  const [loginId, setLoginId] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const onSend = async () => {
    if (!loginId.trim()) {
      toast({ title: "Login ID required", variant: "destructive" });
      return;
    }
    try {
      setBusy(true);
      await apiRequestOTP(loginId.trim());
      // store for next steps
      sessionStorage.setItem("fp_loginId", loginId.trim());
      toast({ title: "OTP sent (if the account exists)." });
      navigate("/forgot/otp");
    } catch (e: any) {
      toast({ title: "Could not start reset", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Forgot Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="loginId">Login ID</Label>
            <Input id="loginId" value={loginId} onChange={(e)=>setLoginId(e.target.value)} placeholder="e.g. A0001 or S1234" />
          </div>
          <Button className="w-full" onClick={onSend} disabled={busy}>
            {busy ? "Sending..." : "Send OTP to Email"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
