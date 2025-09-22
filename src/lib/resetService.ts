import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebaseConfig";

const call = (name: string) => httpsCallable(functions, name);

export async function apiRequestOTP(loginId: string) {
  const fn = call("requestPasswordResetOTP");
  const res: any = await fn({ loginId });
  return res?.data;
}

export async function apiVerifyOTP(loginId: string, otp: string) {
  const fn = call("verifyPasswordResetOTP");
  const res: any = await fn({ loginId, otp });
  return res?.data as { success: boolean; resetToken?: string };
}

export async function apiSetNewPassword(loginId: string, resetToken: string, newPassword: string) {
  const fn = call("setNewPassword");
  const res: any = await fn({ loginId, resetToken, newPassword });
  return res?.data;
}
