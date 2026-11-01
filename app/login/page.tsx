"use client";
import { useFormState } from "react-dom";
import { loginAction } from "../actions";

export default function LoginPage() {
  const [state, action] = useFormState(loginAction, null as { error?: string } | null);
  return (
    <form action={action} className="mx-auto mt-16 max-w-sm space-y-3 rounded border bg-white p-6">
      <h1 className="text-xl font-bold">Masuk Dasbor</h1>
      <input name="password" type="password" placeholder="Password dasbor" className="w-full rounded border px-3 py-2" />
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="w-full rounded bg-black px-3 py-2 text-white">Masuk</button>
    </form>
  );
}
