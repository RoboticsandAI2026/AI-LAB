import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";

import Index from "./pages/Index";
import Auth from "./pages/Auth";
import SignupComplete from "./pages/SignupComplete";
import StudentDashboard from "./pages/StudentDashboard";
import FacultyDashboard from "./pages/FacultyDashboard";
import AdminDashboard from "./pages/AdminDashboard";

// NEW: Forgot-password pages
import ForgotPassword from "./pages/ForgotPassword";
import ResetOTP from "./pages/ResetOTP";
import NewPassword from "./pages/NewPassword";

// Simple role-based guard
function ProtectedRoute({
  children,
  allowed,
}: {
  children: JSX.Element;
  allowed: ("ADMIN" | "FACULTY" | "STUDENT")[];
}) {
  const role = localStorage.getItem("role");
  if (!role) return <Navigate to="/auth" replace />;
  return allowed.includes(role as any) ? children : <Navigate to="/auth" replace />;
}

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Index />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/signup" element={<SignupComplete />} />

        {/* Forgot password flow (public) */}
        <Route path="/forgot" element={<ForgotPassword />} />
        <Route path="/forgot/otp" element={<ResetOTP />} />
        <Route path="/forgot/new" element={<NewPassword />} />

        {/* Role-based dashboards */}
        <Route
          path="/dashboard/admin"
          element={
            <ProtectedRoute allowed={["ADMIN"]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/faculty"
          element={
            <ProtectedRoute allowed={["FACULTY"]}>
              <FacultyDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/student"
          element={
            <ProtectedRoute allowed={["STUDENT"]}>
              <StudentDashboard />
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
