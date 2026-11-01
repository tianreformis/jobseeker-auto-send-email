import { isAuthenticated } from "@/lib/auth";
import { redirect } from "next/navigation";
import NewJobForm from "./form";

export const dynamic = "force-dynamic";

export default function NewJobPage() {
  if (!isAuthenticated()) redirect("/login");
  return <NewJobForm />;
}
