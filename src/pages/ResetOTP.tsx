import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { apiVerifyOTP } from "@/lib/resetService";

export default function ResetOTP() {
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const loginId = sessionStorage.getItem("fp_loginId") || "";

  useEffect(() => {
    if (!loginId) navigate("/forgot");
  }, [loginId, navigate]);

  const onVerify = async () => {
    if (!otp.trim()) {
      toast({ title: "OTP required", variant: "destructive" });
      return;
    }
    try {
      setBusy(true);
      const res = await apiVerifyOTP(loginId, otp.trim());
      if (res?.success && res?.resetToken) {
        sessionStorage.setItem("fp_token", res.resetToken);
        navigate("/forgot/new");
      } else {
        toast({ title: "OTP verification failed", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Verification error", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Enter OTP</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">We sent a 6-digit OTP to the registered email for <span className="font-medium">{loginId}</span>.</div>
          <div className="space-y-2">
            <Label htmlFor="otp">OTP</Label>
            <Input id="otp" value={otp} onChange={(e)=>setOtp(e.target.value)} placeholder="123456" />
          </div>
          <Button className="w-full" onClick={onVerify} disabled={busy}>{busy ? "Verifying..." : "Verify OTP"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
