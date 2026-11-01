import { isAuthenticated } from "@/lib/auth";
import { findTodos, loadProfile } from "@/lib/profile";
import { redirect } from "next/navigation";

export default function Home() {
  if (!isAuthenticated()) redirect("/login");
  const todos = findTodos(loadProfile());
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Dasbor</h1>
      {todos.length > 0 && (
        <div className="rounded border border-amber-400 bg-amber-50 p-3 text-sm">
          <strong>Peringatan:</strong> profile.json masih mengandung {todos.length} TODO:{" "}
          {todos.slice(0, 8).join(", ")}
          {todos.length > 8 ? "…" : ""} — lengkapi di halaman Profil.
        </div>
      )}
      <p className="text-sm text-zinc-600">
        Mode: review (default). Tempel lowongan di Input Baru untuk mulai.
      </p>
    </div>
  );
}
