import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/hooks";

export default function LoginPage() {
  const { session, isAdmin, loading, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && session) return <Navigate to={isAdmin ? "/admin" : "/admin"} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const err = await signIn(email.trim(), password);
    if (err) setError(err);
    setBusy(false);
  };

  return (
    <div className="card login-box">
      <h1>כניסת מנהלת</h1>
      <p className="muted small">העיון בקטלוג פתוח לכולן ואינו דורש כניסה.</p>
      {error && <div className="notice error" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="email">דוא״ל</label>
          <input id="email" type="email" dir="ltr" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">סיסמה</label>
          <input id="password" type="password" dir="ltr" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "נכנסת…" : "כניסה"}</button>
      </form>
    </div>
  );
}
