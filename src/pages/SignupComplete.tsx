import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { CheckCircle, Shield } from "lucide-react";

import { auth, db } from "@/firebaseConfig";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  deleteUser,
  linkWithCredential,
  EmailAuthProvider,
  User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

type Role = "STUDENT" | "FACULTY";
type Phase = "auth" | "form" | "done";

function inferRoleFromEmail(email: string): Role {
  const local = (email.split("@")[0] || "").trim();
  return /^\d{6,12}$/.test(local) ? "STUDENT" : "FACULTY";
}
function digitsOnly(s: string): string {
  return (s || "").replace(/\D/g, "");
}

export default function SignupComplete() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [phase, setPhase] = useState<Phase>("auth");
  const [creating, setCreating] = useState(false);

  // after Google
  const [gUser, setGUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  // auto-detected role + inputs
  const [role, setRole] = useState<Role>("STUDENT");
  const [phone, setPhone] = useState(""); // FACULTY only
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const loginId = useMemo(() => {
    if (!email) return "";
    const local = email.split("@")[0] || "";
    if (role === "STUDENT") return /^\d+$/.test(local) ? local : "";
    const d = digitsOnly(phone);
    return d.length >= 4 ? `F${d.slice(-4)}` : "";
  }, [email, role, phone]);

  const handleGoogleSignupStart = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ hd: "sastra.ac.in", prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      const u = result.user;
      const mail = (u.email || "").toLowerCase();

      if (!/@sastra\.ac\.in$/.test(mail)) {
        try { await deleteUser(u); } catch {}
        try { await signOut(auth); } catch {}
        toast({ title: "Only @sastra.ac.in allowed", description: "Use your official SASTRA email.", variant: "destructive" });
        return;
      }

      const detectedRole = inferRoleFromEmail(mail);
      setRole(detectedRole);

      setGUser(u);
      setEmail(mail);
      setName(u.displayName || "");
      setPhase("form");
    } catch (err: any) {
      console.error("[Google OAuth] code:", err?.code, "message:", err?.message);
      toast({ title: "Google sign-in failed", description: err?.code || "See console for details.", variant: "destructive" });
      try { await signOut(auth); } catch {}
    }
  };

  const handleFinishSignup = async () => {
    try {
      if (!gUser || !email) {
        toast({ variant: "destructive", title: "Not authenticated", description: "Sign in with Google first." });
        setPhase("auth");
        return;
      }

      if (role === "STUDENT") {
        const local = email.split("@")[0] || "";
        if (!/^\d+$/.test(local)) {
          toast({ variant: "destructive", title: "Invalid student email", description: "Expected like 126179012@sastra.ac.in" });
          return;
        }
      } else {
        const d = digitsOnly(phone);
        if (d.length < 4) {
          toast({ variant: "destructive", title: "Phone required", description: "Faculty Login ID = F + last 4 digits of phone." });
          return;
        }
      }

      if (!loginId) {
        toast({ variant: "destructive", title: "Login ID error", description: "Could not derive Login ID." });
        return;
      }
      if (password.length < 8) {
        toast({ variant: "destructive", title: "Weak password", description: "Minimum 8 characters." });
        return;
      }
      if (password !== confirm) {
        toast({ variant: "destructive", title: "Password mismatch", description: "Passwords do not match." });
        return;
      }

      setCreating(true);

      const lookupRef = doc(db, "loginLookup", loginId);
      const lookupSnap = await getDoc(lookupRef);
      if (lookupSnap.exists()) {
        toast({ variant: "destructive", title: "Login ID in use", description: `"${loginId}" is already taken.` });
        setCreating(false);
        return;
      }

      // link email/password to the Google account
      const cred = EmailAuthProvider.credential(email, password);
      await linkWithCredential(gUser, cred);

      const uid = gUser.uid;
      const profile = {
        uid,
        name: name || "",
        email,
        loginId,
        role,
        phone: role === "FACULTY" ? digitsOnly(phone) : "",
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(db, "users", uid), profile, { merge: true });
      await setDoc(lookupRef, { email, uid });

      try { await signOut(auth); } catch {}
      setPhase("done");
    } catch (err: any) {
      console.error("[signup finish] failed", err);
      let msg = err?.message || "Something went wrong.";
      if (err?.code === "auth/credential-already-in-use") {
        msg = "This email already has a password account. Log in, then link Google in account settings.";
      }
      toast({ title: "Could not complete signup", description: msg, variant: "destructive" });
      setCreating(false);
    }
  };

  if (phase === "done") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-md mx-auto">
            <Card>
              <CardHeader className="text-center">
                <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-3" />
                <CardTitle className="text-2xl text-green-700">Account Created!</CardTitle>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <p><strong>Email:</strong> {email}</p>
                <p><strong>Login ID:</strong> {loginId}</p>
                <Button className="w-full" onClick={() => navigate("/auth")}>Go to Login</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "form") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-lg mx-auto">
            <Card>
              <CardHeader className="text-center">
                <Shield className="h-12 w-12 text-primary mx-auto mb-3" />
                <CardTitle className="text-2xl">Complete Your Profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Email</Label>
                  <Input value={email} readOnly />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Name</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
                  </div>
                  <div>
                    <Label>Role (auto-detected)</Label>
                    <Input value={role} readOnly />
                    <p className="text-xs text-muted-foreground mt-1">
                      {role === "STUDENT" ? "Detected from numeric email local-part." : "Detected from non-numeric local-part."}
                    </p>
                  </div>
                </div>

                {role === "FACULTY" && (
                  <div>
                    <Label>Phone (for Login ID generation)</Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit phone number" />
                    <p className="text-xs text-muted-foreground mt-1">
                      Your Login ID will be <code>F</code> + last 4 digits of your phone.
                    </p>
                  </div>
                )}

                <div>
                  <Label>Login ID (auto-generated)</Label>
                  <Input value={loginId} readOnly placeholder="Generated from email/phone" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Create Password</Label>
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" />
                  </div>
                  <div>
                    <Label>Confirm Password</Label>
                    <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter password" />
                  </div>
                </div>

                <Button className="w-full" onClick={handleFinishSignup} disabled={creating || !loginId}>
                  {creating ? "Creating account…" : "Finish Signup"}
                </Button>

                <p className="text-sm text-muted-foreground text-center mt-2">
                  After this step, use <strong>Login ID</strong> + <strong>Password</strong> on the Login page.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // phase === "auth"
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader className="text-center">
              <Shield className="h-12 w-12 text-primary mx-auto mb-3" />
              <CardTitle className="text-2xl">Sign Up</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Step 1: Continue with Google using your <strong>@sastra.ac.in</strong> email.
              </p>
              <Button className="w-full" onClick={handleGoogleSignupStart}>
                Continue with Google (@sastra.ac.in)
              </Button>
              <p className="text-xs text-muted-foreground">
                Step 2: Fill your details. We’ll auto-detect your role and generate your Login ID.
              </p>

              <p className="text-sm text-muted-foreground text-center mt-4">
                Already have an account?{" "}
                <button className="underline" onClick={() => navigate("/auth")}>Log in</button>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
