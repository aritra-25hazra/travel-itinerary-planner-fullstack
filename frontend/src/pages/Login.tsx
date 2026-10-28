import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Card, Field, inputClass } from "../components/ui";
import { useAuth } from "../lib/auth";
import { useStore } from "../lib/store";

export default function Login() {
  const nav = useNavigate();
  const { enabled, session, signIn, signUp, signOut } = useAuth();
  const toast = useStore((s) => s.toast);
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const err = mode === "in" ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (err) return setMsg(err);
    toast("success", mode === "in" ? "Signed in." : "Account created.");
    nav("/trips");
  }

  if (!enabled) {
    return (
      <Card className="max-w-md mx-auto p-8 text-center space-y-3">
        <h1 className="font-display text-2xl text-teal">Guest mode</h1>
        <p className="text-sm text-muted">Authentication isn't configured on this deployment (no Supabase keys). You can still plan, customise, export and save trips — they're kept for this browser.</p>
        <Link to="/plan"><Button className="mt-2">Continue as guest</Button></Link>
      </Card>
    );
  }

  if (session) {
    return (
      <Card className="max-w-md mx-auto p-8 text-center space-y-3">
        <h1 className="font-display text-2xl text-teal">You're signed in</h1>
        <p className="text-sm text-muted">{session.user.email}</p>
        <div className="flex justify-center gap-2"><Link to="/trips"><Button>My trips</Button></Link><Button variant="secondary" onClick={() => signOut()}>Sign out</Button></div>
      </Card>
    );
  }

  return (
    <Card className="max-w-md mx-auto p-8">
      <h1 className="font-display text-2xl text-teal">{mode === "in" ? "Sign in" : "Create account"}</h1>
      <p className="text-sm text-muted mt-1">Email + password via Supabase Auth. Trips are stored per account with row-level security.</p>
      <form onSubmit={submit} className="space-y-4 mt-5">
        <Field label="Email"><input type="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
        <Field label="Password" hint={mode === "up" ? "At least 6 characters." : undefined}><input type="password" required minLength={6} className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} /></Field>
        {msg && <p className="text-sm text-red-700 bg-red-50 rounded-xl px-3 py-2">{msg}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : mode === "in" ? "Sign in" : "Sign up"}</Button>
      </form>
      <button className="text-sm text-teal underline mt-4" onClick={() => setMode(mode === "in" ? "up" : "in")}>
        {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
      </button>
      <p className="text-xs text-muted mt-4">Or <Link to="/plan" className="underline">continue as guest</Link>.</p>
    </Card>
  );
}
