"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#070A12] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7C5CFF] to-[#22D3EE] flex items-center justify-center mx-auto mb-6 shadow-lg shadow-purple-500/30">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          </div>
          <h1 className="text-white text-2xl font-bold mb-2">Check your email</h1>
          <p className="text-white/40 text-sm">
            We sent a confirmation link to <span className="text-white/70">{email}</span>.
            Click it to activate your account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070A12] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7C5CFF] to-[#22D3EE] flex items-center justify-center shadow-lg shadow-purple-500/30">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
              <path d="M3 3H21V21H3V7H17V17H7V11H13V13"/>
            </svg>
          </div>
          <span className="text-white text-xl font-bold">Phylax</span>
        </div>

        <h1 className="text-white text-2xl font-bold text-center mb-2">Create your account</h1>
        <p className="text-white/40 text-center text-sm mb-8">Set up your parent dashboard</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-white/50 text-xs font-medium mb-1.5">Your name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#7C5CFF]/50 transition"
              placeholder="Parent name"
            />
          </div>

          <div>
            <label className="block text-white/50 text-xs font-medium mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#7C5CFF]/50 transition"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-white/50 text-xs font-medium mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#7C5CFF]/50 transition"
              placeholder="At least 8 characters"
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#7C5CFF] to-[#7C5CFF]/80 text-white font-semibold py-3 rounded-xl shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="text-white/30 text-sm text-center mt-6">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-[#7C5CFF] hover:text-[#22D3EE] transition">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
