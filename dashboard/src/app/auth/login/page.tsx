"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen bg-[#070A12] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div className="relative w-28 h-28 mb-4">
            <Image
              src="/phylax-shield.jpg"
              alt="Phylax"
              width={112}
              height={112}
              className="rounded-2xl shadow-2xl shadow-[#2B1766]/60"
              priority
            />
          </div>
          <h2 className="text-purple-400 font-semibold text-xl tracking-[0.15em] mt-3" style={{ fontFamily: "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif" }}>PHYLAX</h2>
        </div>

        <h1 className="text-white text-2xl font-bold text-center mb-2">Welcome back</h1>
        <p className="text-white/50 text-center text-sm mb-8">Sign in to your parent dashboard</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-white/60 text-xs font-medium mb-1.5">Email</label>
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
            <label className="block text-white/60 text-xs font-medium mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-white/20 focus:outline-none focus:border-[#7C5CFF]/50 transition"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#7C5CFF] to-[#7C5CFF]/80 text-white font-semibold py-3 rounded-xl shadow-lg shadow-purple-500/25 hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="text-white/40 text-sm text-center mt-6">
          Don&apos;t have an account?{" "}
          <Link href="/auth/signup" className="text-[#7C5CFF] hover:text-[#22D3EE] transition">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
