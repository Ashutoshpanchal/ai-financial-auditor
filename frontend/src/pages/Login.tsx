import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";

export default function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [devError, setDevError] = useState("");
  const [devLoading, setDevLoading] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate("/dashboard", { replace: true });
  }, [user, loading, navigate]);

  const handleGoogleLogin = async () => {
    const res = await api.get<{ auth_url: string }>("/auth/google/login");
    window.location.href = res.data.auth_url;
  };

  const handleDevLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setDevError("");
    setDevLoading(true);
    try {
      await api.post("/auth/dev-login", { email, password });
      window.location.href = "/dashboard";
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? "Login failed.";
      setDevError(msg);
    } finally {
      setDevLoading(false);
    }
  };

  if (loading) return null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100">
      <div className="w-full max-w-md rounded-2xl bg-white p-10 shadow-xl">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          AI Financial Auditor
        </h1>
        <p className="mb-8 text-gray-500">
          Upload your bank statements and get instant AI-powered financial
          insights.
        </p>

        {/* Google OAuth */}
        <button
          onClick={handleGoogleLogin}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          <img
            src="https://www.google.com/favicon.ico"
            alt="Google"
            className="h-5 w-5"
          />
          Continue with Google
        </button>

        {/* Dev admin login — backend rejects this in production */}
        <>
            <div className="my-6 flex items-center gap-3">
              <hr className="flex-1 border-gray-200" />
              <span className="text-xs text-gray-400 uppercase tracking-wider">
                Dev Login
              </span>
              <hr className="flex-1 border-gray-200" />
            </div>

            <form onSubmit={handleDevLogin} className="space-y-3">
              <input
                type="email"
                placeholder="Super-admin email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
              <input
                type="password"
                placeholder="Password (DEV_LOGIN_PASSWORD)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
              {devError && (
                <p className="text-xs text-red-500">{devError}</p>
              )}
              <button
                type="submit"
                disabled={devLoading}
                className="w-full rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {devLoading ? "Signing in…" : "Sign in as Super Admin"}
              </button>
            </form>

            <p className="mt-3 text-center text-xs text-gray-400">
              Dev login only works when{" "}
              <code className="font-mono">ENVIRONMENT=development</code> and{" "}
              <code className="font-mono">DEV_LOGIN_PASSWORD</code> is set.
            </p>
        </>
      </div>
    </div>
  );
}
