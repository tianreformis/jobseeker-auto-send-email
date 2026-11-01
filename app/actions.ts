"use server";
import { checkPassword, setSession } from "@/lib/auth";
import { saveProfile } from "@/lib/profile";
import { redirect } from "next/navigation";

export async function loginAction(_prev: unknown, formData: FormData) {
  const pw = String(formData.get("password") ?? "");
  if (!checkPassword(pw)) return { error: "Password salah" };
  setSession();
  redirect("/");
}

export async function saveProfileAction(formData: FormData) {
  const raw = String(formData.get("profile") ?? "");
  const parsed = JSON.parse(raw) as unknown;
  saveProfile(parsed);
  redirect("/profile");
}
