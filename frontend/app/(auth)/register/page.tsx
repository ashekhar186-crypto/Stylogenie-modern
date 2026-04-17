'use client';

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RegisterInput, registerSchema } from "@/lib/validators";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/providers/auth";
import Link from "next/link";

export default function RegisterPage() {
  const { setUser } = useAuth();
  const router = useRouter();
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } =
    useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (data: RegisterInput) => {
    try {
      const res = await api.post("/api/v1/auth/register", data);
      setUser(res.data.user);
      router.push("/describe");
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? "Registration failed";
      setError("email", { message: msg });
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <span className="text-5xl">🧞</span>
        <h1 className="text-white font-bold text-2xl mt-3">StyloGenie</h1>
        <p className="text-white/40 text-sm mt-1">Your AI Fashion System</p>
      </div>

      <div className="bg-slate-800/80 backdrop-blur-sm border border-white/10 rounded-2xl p-7 shadow-2xl space-y-5">
        <h2 className="text-white font-semibold text-lg">Create your account</h2>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-white/60 text-xs font-medium">Full Name</label>
            <input
              {...register("name")}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-purple-500 transition-colors"
              placeholder="Your name"
            />
            {errors.name && <p className="text-red-400 text-xs">{errors.name.message}</p>}
          </div>
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
              placeholder="Min 6 characters"
            />
            {errors.password && <p className="text-red-400 text-xs">{errors.password.message}</p>}
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 text-white font-semibold text-sm transition-all disabled:opacity-50"
          >
            {isSubmitting ? "Creating account…" : "Get Started"}
          </button>
        </form>

        <p className="text-center text-white/40 text-xs">
          Already have an account?{" "}
          <Link href="/login" className="text-purple-400 hover:text-purple-300 underline transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
