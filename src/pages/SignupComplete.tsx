import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

// UI
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Shield } from "lucide-react";

// Firebase
import { auth, db } from "../firebaseConfig";
import {
  GoogleAuthProvider,
  signInWithPopup,
  deleteUser,
  signOut,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

// Pre-seeded Admin Accounts (loginId → { email, name })
const ADMIN_ACCOUNTS: Record<string, { email: string; name: string }> = {
  A0001: { email: "venkatesh@eee.sastra.edu", name: "T. Venkatesh" },
  A0002: { email: "126179012@sastra.ac.in", name: "Karthikeya" },
  A0003: { email: "126179030@sastra.ac.in", name: "Vaishnavi" },
};

type Role = "STUDENT" | "FACULTY" | "ADMIN";

const SignupComplete = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [role, setRole] = useState<Role>("STUDENT");

  const [creating, setCreating] = useState(false);
  const [done, setDone] = useState(false);

  const adminPreset = useMemo(() => ADMIN_ACCOUNTS[loginId] || null, [loginId]);
  const isAdminLoginId = !!adminPreset;

  const handleGoogleSignup = async () => {
    try {
      if (!loginId.trim()) {
        toast({
          title: "Login ID required",
          description: "Please enter your campus Login ID first.",
          variant: "destructive",
        });
        return;
      }
      if (isAdminLoginId) {
        toast({
          title: "Admins are pre-created",
          description:
            "Admin accounts are seeded by IT. Please go to the Login page and use your admin credentials.",
        });
        return;
      }

      setCreating(true);

      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ hd: "sastra.ac.in", prompt: "select_account" });

      const result = await signInWithPopup(auth, provider);
      const gUser = result.user;
      const email = (gUser.email || "").toLowerCase();
      const displayName = gUser.displayName || name || "";

      if (!/@sastra\.ac\.in$/.test(email)) {
        try { await deleteUser(gUser); } catch {}
        try { await signOut(auth); } catch {}
        toast({
          title: "Only @sastra.ac.in allowed",
          description: "Please sign up using your official SASTRA email.",
          variant: "destructive",
        });
        setCreating(false);
        return;
      }

      // Ensure loginId uniqueness via loginLookup/{loginId}
      const lookupRef = doc(db, "loginLookup", loginId);
      const lookupSnap = await getDoc(lookupRef);
      if (lookupSnap.exists()) {
        toast({
          variant: "destructive",
          title: "Login ID in use",
          description: `The Login ID "${loginId}" is already taken.`,
        });
        try { await signOut(auth); } catch {}
        setCreating(false);
        return;
      }

      const uid = gUser.uid;
      const accountName = displayName || name;
      const accountEmail = email;
      const accountRole: Role = role; // STUDENT or FACULTY

      // Create profile at users/{uid}
      await setDoc(
        doc(db, "users", uid),
        {
          uid,
          name: accountName,
          email: accountEmail,
          loginId,
          role: accountRole,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Map loginId -> {email, uid}
      await setDoc(lookupRef, { email: accountEmail, uid });

      // Persist locally
      localStorage.setItem("loginId", loginId);
      localStorage.setItem("role", accountRole);
      localStorage.setItem("name", accountName);
      localStorage.setItem("email", accountEmail);

      setDone(true);
      toast({ title: "Signup complete", description: `Welcome, ${accountName}!` });
    } catch (err: any) {
      console.error("[Google signup] failed", err);
      toast({
        title: "Google signup failed",
        description: err?.message || "Something went wrong.",
        variant: "destructive",
      });
      try { await signOut(auth); } catch {}
    } finally {
      setCreating(false);
    }
  };

  const goLogin = () => navigate("/auth");

  if (done) {
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
                <p><strong>Login ID:</strong> {loginId}</p>
                <p><strong>Email:</strong> {localStorage.getItem("email") || ""}</p>
                <Button className="w-full" onClick={goLogin}>Go to Login</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader className="text-center">
              <Shield className="h-12 w-12 text-primary mx-auto mb-3" />
              <CardTitle className="text-2xl">Create Your Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                        checked={!isAdminLoginId && role === "STUDENT"}
                        onChange={() => setRole("STUDENT")}
                        disabled={isAdminLoginId}
                      />
                      Student
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="role"
                        value="FACULTY"
                        checked={!isAdminLoginId && role === "FACULTY"}
                        onChange={() => setRole("FACULTY")}
                        disabled={isAdminLoginId}
                      />
                      Faculty
                    </label>
                    <label className="flex items-center gap-2 text-sm opacity-70">
                      <input type="radio" name="role" value="ADMIN" checked={isAdminLoginId} readOnly />
                      Admin
                    </label>
                  </div>
                </div>
              </div>

              <div>
                <Label>Login ID</Label>
                <Input
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder="S123456 / F1234 / A0001"
                />
              </div>

              {isAdminLoginId ? (
                <div className="text-sm p-3 rounded border">
                  <p className="font-medium">Admin account detected (Login ID {loginId}).</p>
                  <p>
                    Admin accounts are <strong>pre-created by IT</strong>. Please go to{" "}
                    <button className="underline" onClick={goLogin}>Login</button> and use your admin credentials.
                  </p>
                </div>
              ) : (
                <>
                  <div className="text-sm text-muted-foreground">
                    New users must sign up with <strong>@sastra.ac.in</strong> using Google.
                  </div>
                  <Button className="w-full" onClick={handleGoogleSignup} disabled={creating}>
                    {creating ? "Signing in…" : "Continue with Google (@sastra.ac.in)"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    We’ll store your profile and link your <code>Login ID</code> to your SASTRA email.
                  </p>
                </>
              )}

              <p className="text-sm text-muted-foreground text-center mt-4">
                Already have an account?{" "}
                <button className="underline" onClick={goLogin}>
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
