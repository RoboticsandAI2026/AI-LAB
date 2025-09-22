import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { apiSetNewPassword } from "@/lib/resetService";

export default function NewPassword() {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const loginId = sessionStorage.getItem("fp_loginId") || "";
  const token = sessionStorage.getItem("fp_token") || "";

  useEffect(() => {
    if (!loginId || !token) navigate("/forgot");
  }, [loginId, token, navigate]);

  const onSave = async () => {
    if (!p1 || p1.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    if (p1 !== p2) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    try {
      setBusy(true);
      await apiSetNewPassword(loginId, token, p1);
      // cleanup and go to login
      sessionStorage.removeItem("fp_loginId");
      sessionStorage.removeItem("fp_token");
      toast({ title: "Password updated. Please log in." });
      navigate("/login");
    } catch (e: any) {
      toast({ title: "Could not set new password", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create New Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="p1">New Password</Label>
            <Input id="p1" type="password" value={p1} onChange={(e)=>setP1(e.target.value)} placeholder="********" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p2">Confirm New Password</Label>
            <Input id="p2" type="password" value={p2} onChange={(e)=>setP2(e.target.value)} placeholder="********" />
          </div>
          <Button className="w-full" onClick={onSave} disabled={busy}>{busy ? "Saving..." : "Save & Sign In"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
