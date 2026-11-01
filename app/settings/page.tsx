import { isAuthenticated } from "@/lib/auth";
import { redirect } from "next/navigation";
import SettingsClient from "./client";

export default function SettingsPage() {
  if (!isAuthenticated()) redirect("/login");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Pengaturan</h1>
      <SettingsClient />
    </div>
  );
}
