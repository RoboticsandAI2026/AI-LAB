import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebaseConfig";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

export default function ForgotReset() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const setPasswordWithTicket = httpsCallable(functions, "setPasswordWithTicket");

  useEffect(() => {
    const ticketId = sessionStorage.getItem("fp.ticketId");
    if (!ticketId) navigate("/forgot");
  }, [navigate]);

  const handleReset = async () => {
    const ticketId = sessionStorage.getItem("fp.ticketId");
    if (!ticketId) {
      navigate("/forgot");
      return;
    }
    if (pwd.length < 8) {
      toast({ variant: "destructive", title: "Weak password", description: "Minimum 8 characters." });
      return;
    }
    if (pwd !== confirm) {
      toast({ variant: "destructive", title: "Password mismatch", description: "Passwords do not match." });
      return;
    }
    setBusy(true);
    try {
      const res: any = await setPasswordWithTicket({ ticketId, newPassword: pwd });
      if (res?.data?.ok) {
        // cleanup
        sessionStorage.removeItem("fp.ticketId");
        sessionStorage.removeItem("fp.emailMasked");
        sessionStorage.removeItem("fp.loginId");

        toast({ title: "Password updated", description: "You can now log in with your new password." });
        navigate("/auth");
      } else {
        throw new Error("Unexpected response");
      }
    } catch (err: any) {
      console.error("[setPasswordWithTicket] failed", err);
      toast({ variant: "destructive", title: "Could not update password", description: err?.message || err?.code || "Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <CardTitle>Create new password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>New password</Label>
            <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Minimum 8 characters" />
          </div>
          <div>
            <Label>Confirm password</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter password" />
          </div>
          <Button className="w-full" onClick={handleReset} disabled={busy}>
            {busy ? "Updating…" : "Update password"}
          </Button>

          <div className="text-sm text-center">
            <button className="underline" onClick={() => navigate("/forgot/verify")}>Back</button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
