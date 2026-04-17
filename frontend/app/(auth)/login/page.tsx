'use client';

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoginInput, loginSchema } from "@/lib/validators";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/providers/auth";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuth();
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } =
    useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginInput) => {
    try {
      const res = await api.post("/api/v1/auth/login", data);
      setUser(res.data.user);
      router.push("/describe");
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? "Invalid credentials";
      setError("email", { message: msg });
    }
  };

  return (
    <div className="w-full max-w-sm">
      {/* Brand */}
      <div className="text-center mb-8">
        <span className="text-5xl">🧞</span>
        <h1 className="text-white font-bold text-2xl mt-3">StyloGenie</h1>
        <p className="text-white/40 text-sm mt-1">Your AI Fashion System</p>
      </div>

      <div className="bg-slate-800/80 backdrop-blur-sm border border-white/10 rounded-2xl p-7 shadow-2xl space-y-5">
        <h2 className="text-white font-semibold text-lg">Welcome back</h2>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-white/60 text-xs font-medium">Email</label>
            <input
              type="email"
              {...register("email")}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-purple-500 transition-colors"
              placeholder="you@example.com"
            />
            {errors.email && <p className="text-red-400 text-xs">{errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-white/60 text-xs font-medium">Password</label>
            <input
              type="password"
              {...register("password")}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-purple-500 transition-colors"
              placeholder="••••••••"
            />
            {errors.password && <p className="text-red-400 text-xs">{errors.password.message}</p>}
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white font-semibold text-sm transition-all disabled:opacity-50"
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-white/40 text-xs">
          New here?{" "}
          <Link href="/register" className="text-purple-400 hover:text-purple-300 underline transition-colors">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
