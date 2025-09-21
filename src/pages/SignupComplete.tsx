import { useEffect, useMemo, useState } from "react";
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
  updatePassword,
  User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

// Optional: hard-coded Admins — they must NOT sign up via this page
const ADMIN_EMAILS = new Set<string>([
  "venkatesh@eee.sastra.edu",
  "126179012@sastra.ac.in",
  "126179030@sastra.ac.in",
]);

type Role = "STUDENT" | "FACULTY";

type Phase = "auth" | "form" | "done";

const SignupComplete = () => {
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

  // derive loginId
  const loginId = useMemo(() => {
    if (!email) return "";
    const local = email.split("@")[0] || "";
    if (role === "STUDENT") {
      // must be numeric like 126179012
      if (/^\d+$/.test(local)) return local;
      return ""; // invalid student email format
    }
    // FACULTY: F + last 4 digits of phone
    const digits = (phone || "").replace(/\D/g, "");
    if (digits.length >= 4) return `F${digits.slice(-4)}`;
    return "";
  }, [email, role, phone]);

  // STEP 1: Google auth (only sastra.ac.in)
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
        toast({
          title: "Only @sastra.ac.in allowed",
          description: "Use your official SASTRA email.",
          variant: "destructive",
        });
        return;
      }

      if (ADMIN_EMAILS.has(mail)) {
        // keep admins as password users (seeded), not through this path
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
      console.error("[google signup] start failed", err);
      toast({
        title: "Google signup failed",
        description: err?.message || "Something went wrong.",
        variant: "destructive",
      });
      try { await signOut(auth); } catch {}
    }
  };

  // STEP 2: Submit details (generate loginId, set password, save profile)
  const handleFinishSignup = async () => {
    try {
      if (!gUser || !email) {
        toast({ variant: "destructive", title: "Not authenticated", description: "Please sign in with Google first." });
        setPhase("auth");
        return;
      }
      // Validate role and derived loginId
      if (role === "STUDENT") {
        const local = email.split("@")[0] || "";
        if (!/^\d+$/.test(local)) {
          toast({
            variant: "destructive",
            title: "Invalid student email",
            description: "Student email must look like 126179012@sastra.ac.in",
          });
          return;
        }
        if (!loginId) {
          toast({ variant: "destructive", title: "Login ID error", description: "Could not derive Login ID." });
          return;
        }
      } else if (role === "FACULTY") {
        const digits = phone.replace(/\D/g, "");
        if (digits.length < 4) {
          toast({
            variant: "destructive",
            title: "Phone required",
            description: "Faculty must enter a valid phone number (to derive Login ID).",
          });
          return;
        }
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

      // Ensure loginId is unique
      const lookupRef = doc(db, "loginLookup", loginId);
      const lookupSnap = await getDoc(lookupRef);
      if (lookupSnap.exists()) {
        toast({
          variant: "destructive",
          title: "Login ID in use",
          description: `The Login ID "${loginId}" is already taken.`,
        });
        setCreating(false);
        return;
      }

      // IMPORTANT: add password to this Google account so the user can log in later via Login page
      // Google sign-in was "recent", so updatePassword is allowed
      await updatePassword(gUser, password);

      // Profile
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

      // Clear auth (optional) and show success
      try { await signOut(auth); } catch {}
      localStorage.removeItem("name");
      localStorage.removeItem("email");
      localStorage.removeItem("loginId");
      localStorage.removeItem("role");

      setPhase("done");
    } catch (err: any) {
      console.error("[signup finish] failed", err);
      const msg = err?.message || "Something went wrong.";
      // If password update failed due to requires-recent-login, ask them to click Google again
      if (msg.includes("requires-recent-login")) {
        toast({
          title: "Session expired",
          description: "Please click 'Continue with Google' again to re-authenticate.",
          variant: "destructive",
        });
        setPhase("auth");
      } else {
        toast({
          title: "Could not complete signup",
          description: msg,
          variant: "destructive",
        });
      }
    } finally {
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
                  <Input value={loginId} readOnly placeholder="Will be generated from email/phone" />
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
                <button className="underline" onClick={() => navigate("/auth")}>
                  Log in
                </button>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SignupComplete;
