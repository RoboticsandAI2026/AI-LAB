import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { CheckCircle, Shield } from "lucide-react";

import { auth, db } from "../firebaseConfig";
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

// Admins should not use this path (they are pre-seeded password users)
const ADMIN_EMAILS = new Set<string>([
  "venkatesh@eee.sastra.edu",
  "126179012@sastra.ac.in",
  "126179030@sastra.ac.in",
]);

export default function SignupComplete() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [phase, setPhase] = useState<Phase>("auth");
  const [creating, setCreating] = useState(false);

  // after Google
  const [gUser, setGUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  // form inputs
  const [role, setRole] = useState<Role>("STUDENT");
  const [phone, setPhone] = useState(""); // for FACULTY
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // derive Login ID
  const loginId = useMemo(() => {
    if (!email) return "";
    const local = email.split("@")[0] || "";
    if (role === "STUDENT") {
      return /^\d+$/.test(local) ? local : ""; // e.g., 126179012@sastra.ac.in -> 126179012
    }
    // FACULTY: F + last 4 digits of phone
    const digits = (phone || "").replace(/\D/g, "");
    return digits.length >= 4 ? `F${digits.slice(-4)}` : "";
  }, [email, role, phone]);

  // Step 1: Google OAuth (popup)
  const handleGoogleSignupStart = async () => {
    try {
      const provider = new GoogleAuthProvider();
      // hd hint; we still enforce email domain after sign-in
      provider.setCustomParameters({ hd: "sastra.ac.in", prompt: "select_account" });

      const result = await signInWithPopup(auth, provider);
      const u = result.user;
      const mail = (u.email || "").toLowerCase();

      if (!/@sastra\.ac\.in$/.test(mail)) {
        try { await deleteUser(u); } catch {}
        try { await signOut(auth); } catch {}
        toast({
          title: "Only @sastra.ac.in allowed",
          description: "Use your official SASTRA email.",
          variant: "destructive",
        });
        return;
      }

      if (ADMIN_EMAILS.has(mail)) {
        await signOut(auth);
        toast({
          title: "Admins cannot sign up here",
          description: "Admins are pre-created. Please log in using your admin credentials.",
          variant: "destructive",
        });
        navigate("/auth");
        return;
      }

      setGUser(u);
      setEmail(mail);
      setName(u.displayName || "");
      setPhase("form");
    } catch (err: any) {
      console.error("[Google OAuth] code:", err?.code, "message:", err?.message);
      let hint = "";
      switch (err?.code) {
        case "auth/operation-not-allowed":
          hint = "Enable Google in Firebase Auth & set your OAuth client ID/secret.";
          break;
        case "auth/unauthorized-domain":
          hint = "Add your site to Firebase Auth Authorized domains & JS origins in Google Cloud.";
          break;
        case "auth/invalid-api-key":
          hint = "Check firebaseConfig.ts points to the same Firebase project you configured.";
          break;
        case "auth/popup-blocked":
          hint = "Allow popups or try another browser.";
          break;
        default:
          hint = "Check Console logs for details.";
      }
      toast({ title: "Google sign-in failed", description: hint, variant: "destructive" });
      try { await signOut(auth); } catch {}
    }
  };

  // Step 2: Save details, generate LoginID, link password to Google account
  const handleFinishSignup = async () => {
    try {
      if (!gUser || !email) {
        toast({ variant: "destructive", title: "Not authenticated", description: "Please sign in with Google first." });
        setPhase("auth");
        return;
      }

      // Validate fields
      if (role === "STUDENT") {
        const local = email.split("@")[0] || "";
        if (!/^\d+$/.test(local)) {
          toast({
            variant: "destructive",
            title: "Invalid student email",
            description: "Expected like 126179012@sastra.ac.in",
          });
          return;
        }
      } else {
        const digits = phone.replace(/\D/g, "");
        if (digits.length < 4) {
          toast({
            variant: "destructive",
            title: "Phone required",
            description: "Faculty must enter a valid phone (for Login ID).",
          });
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

      // Ensure loginId uniqueness
      const lookupRef = doc(db, "loginLookup", loginId);
      const lookupSnap = await getDoc(lookupRef);
      if (lookupSnap.exists()) {
        toast({ variant: "destructive", title: "Login ID in use", description: `"${loginId}" is already taken.` });
        setCreating(false);
        return;
      }

      // Link Email/Password to this Google user (so they can use Login page)
      const cred = EmailAuthProvider.credential(email, password);
      await linkWithCredential(gUser, cred);

      // Write profile & login mapping
      const uid = gUser.uid;
      const profile = {
        uid,
        name: name || "",
        email,
        loginId,
        role,
        phone: role === "FACULTY" ? phone : "",
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(db, "users", uid), profile, { merge: true });
      await setDoc(lookupRef, { email, uid });

      // Sign out after creation (optional)
      try { await signOut(auth); } catch {}

      setPhase("done");
    } catch (err: any) {
      console.error("[signup finish] failed", err);
      let msg = err?.message || "Something went wrong.";
      if (err?.code === "auth/credential-already-in-use") {
        msg = "This email already has a password account. Try logging in, then link Google in account settings.";
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
                <Button className="w-full" onClick={() => navigate("/auth")}>
                  Go to Login
                </Button>
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
                    <Label>Role</Label>
                    <div className="flex items-center gap-4 h-10">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="role"
                          value="STUDENT"
                          checked={role === "STUDENT"}
                          onChange={() => setRole("STUDENT")}
                        />
                        Student
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="role"
                          value="FACULTY"
                          checked={role === "FACULTY"}
                          onChange={() => setRole("FACULTY")}
                        />
                        Faculty
                      </label>
                    </div>
                  </div>
                </div>

                {role === "FACULTY" && (
                  <div>
                    <Label>Phone (for Login ID generation)</Label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="10-digit phone number"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Your Login ID will be <code>F</code> + last 4 digits of your phone.
                    </p>
                  </div>
                )}

                <div>
                  <Label>Login ID (auto-generated)</Label>
                  <Input value={loginId} readOnly placeholder="Generated from email/phone" />
                  {role === "STUDENT" && !loginId && (
                    <p className="text-xs text-destructive mt-1">
                      Student email must look like <code>126179012@sastra.ac.in</code>.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Create Password</Label>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min 8 characters"
                    />
                  </div>
                  <div>
                    <Label>Confirm Password</Label>
                    <Input
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Re-enter password"
                    />
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
                Step 2: Fill your details, we’ll generate your Login ID and set your password for future logins.
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
