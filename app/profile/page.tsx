import { loadProfile, findTodos } from "@/lib/profile";
import { isAuthenticated } from "@/lib/auth";
import { redirect } from "next/navigation";
import { saveProfileAction } from "../actions";

export default function ProfilePage() {
  if (!isAuthenticated()) redirect("/login");
  const profile = loadProfile();
  const todos = findTodos(profile);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Profil</h1>
      {todos.length > 0 && (
        <p className="text-sm text-amber-700">Masih ada {todos.length} TODO: {todos.join(", ")}</p>
      )}
      <form action={saveProfileAction} className="space-y-3">
        <textarea
          name="profile"
          defaultValue={JSON.stringify(profile, null, 2)}
          rows={30}
          spellCheck={false}
          className="w-full rounded border p-3 font-mono text-xs"
        />
        <button className="rounded bg-black px-4 py-2 text-white">Simpan Profil</button>
      </form>
    </div>
  );
}
