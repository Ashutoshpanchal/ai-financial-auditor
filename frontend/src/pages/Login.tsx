import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";

export default function Login() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate("/dashboard", { replace: true });
  }, [user, loading, navigate]);

  const handleGoogleLogin = async () => {
    const res = await api.get<{ auth_url: string }>("/auth/google/login");
    window.location.href = res.data.auth_url;
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100">
      <div className="w-full max-w-md rounded-2xl bg-white p-10 shadow-xl">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">AI Financial Auditor</h1>
        <p className="mb-8 text-gray-500">
          Upload your bank statements and get instant AI-powered financial insights.
        </p>
        <button
          onClick={handleGoogleLogin}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" className="h-5 w-5" />
          Continue with Google
        </button>
      </div>
    </div>
  );
}
