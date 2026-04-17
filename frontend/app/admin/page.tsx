"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/app/providers/auth";
import { useRouter } from "next/navigation";
import type { AdminStats, Item } from "@/lib/types";

/* ─── Stats Cards ─── */
function StatsPanel({ stats }: { stats: AdminStats }) {
  const cards = [
    { label: "Total Users", value: stats.totalUsers, icon: "👥", color: "from-blue-900/40 to-blue-800/20 border-blue-700/30" },
    { label: "Total Items", value: stats.totalItems, icon: "👗", color: "from-purple-900/40 to-purple-800/20 border-purple-700/30" },
    { label: "Pending Review", value: stats.pendingItems, icon: "⏳", color: "from-amber-900/40 to-amber-800/20 border-amber-700/30" },
    { label: "Approved Items", value: stats.approvedItems, icon: "✅", color: "from-green-900/40 to-green-800/20 border-green-700/30" },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(({ label, value, icon, color }) => (
        <div key={label} className={`rounded-2xl border bg-gradient-to-br ${color} p-4`}>
          <p className="text-2xl mb-2">{icon}</p>
          <p className="text-white font-bold text-2xl">{value.toLocaleString()}</p>
          <p className="text-white/50 text-xs mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  );
}

/* ─── Section breakdown ─── */
function SectionBreakdown({ data }: { data: { section: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <div className="bg-slate-800/50 rounded-2xl border border-white/5 p-5">
      <h3 className="text-white font-semibold text-sm mb-4">Items by Section</h3>
      <div className="space-y-2.5">
        {data.sort((a, b) => b.count - a.count).map(({ section, count }) => (
          <div key={section}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-white/70">{section}</span>
              <span className="text-white/50">{count}</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-600 to-violet-500 transition-all"
                style={{ width: total ? `${(count / total) * 100}%` : "0%" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Users Table ─── */
function UsersPanel() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const r = await api.get("/api/v1/admin/users");
      return r.data as { users: any[]; total: number };
    },
  });

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api.patch(`/api/v1/admin/users/${id}/role`, { role }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-users"] }); toast.success("Role updated"); },
    onError: () => toast.error("Failed to update role"),
  });

  if (isLoading) return <div className="text-white/40 text-sm py-6 text-center">Loading users…</div>;

  return (
    <div className="bg-slate-800/50 rounded-2xl border border-white/5 overflow-hidden">
      <div className="px-5 py-4 border-b border-white/5">
        <h3 className="text-white font-semibold text-sm">All Users ({data?.total ?? 0})</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              {["Name", "Email", "Role", "Items", "Joined", "Action"].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-white/30 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.users.map((u: any) => (
              <tr key={u.id} className="border-b border-white/5 hover:bg-white/2 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-purple-600/60 flex items-center justify-center text-white text-[10px] font-bold">{u.name?.[0]?.toUpperCase()}</div>
                    <span className="text-white text-xs font-medium">{u.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-white/50 text-xs">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${u.role === "ADMIN" ? "bg-amber-900/40 text-amber-300 border border-amber-700/30" : "bg-white/5 text-white/40 border border-white/10"}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-white/50 text-xs">{u.itemCount}</td>
                <td className="px-4 py-3 text-white/40 text-xs">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => roleMut.mutate({ id: u.id, role: u.role === "ADMIN" ? "MEMBER" : "ADMIN" })}
                    disabled={roleMut.isPending}
                    className="text-[10px] px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white border border-white/10 transition-colors disabled:opacity-40"
                  >
                    {u.role === "ADMIN" ? "→ Member" : "→ Admin"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Items Moderation ─── */
function ItemsPanel() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "pending" | "approved">("pending");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-items", filter],
    queryFn: async () => {
      const r = await api.get(`/api/v1/admin/items?filter=${filter}`);
      return r.data as { items: (Item & { owner: { name: string; email: string } })[]; total: number };
    },
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => api.patch(`/api/v1/admin/items/${id}/approve`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-items"] }); toast.success("Item approved"); },
  });

  const archiveMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/admin/items/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-items"] }); toast.success("Item archived"); },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-white font-semibold text-sm">Item Moderation</h3>
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          {(["pending", "approved", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 text-xs capitalize transition-colors ${filter === f ? "bg-purple-600 text-white" : "bg-white/5 text-white/40 hover:text-white"}`}>{f}</button>
          ))}
        </div>
        <span className="text-white/30 text-xs">{data?.total ?? 0} items</span>
      </div>

      {isLoading && <div className="text-white/40 text-sm py-6 text-center">Loading items…</div>}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {data?.items.map((it) => (
          <div key={it.id} className="bg-slate-800/50 rounded-xl border border-white/5 overflow-hidden">
            {it.imageUrl ? (
              <img src={it.imageUrl} alt={it.title ?? "item"} className="w-full aspect-[3/4] object-cover" />
            ) : (
              <div className="aspect-[3/4] bg-slate-900 flex items-center justify-center text-3xl opacity-20">👗</div>
            )}
            <div className="p-3 space-y-2">
              <p className="text-white text-xs font-medium line-clamp-1">{it.title || "Untitled"}</p>
              <p className="text-white/30 text-[10px]">by {(it as any).owner?.name}</p>
              <div className="flex items-center gap-1.5">
                {it.section && <span className="px-1.5 py-0.5 rounded-full bg-purple-900/30 text-purple-300 text-[9px]">{it.section}</span>}
                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${it.approved ? "bg-green-900/40 text-green-300" : "bg-amber-900/40 text-amber-300"}`}>
                  {it.approved ? "Approved" : "Pending"}
                </span>
              </div>
              <div className="flex gap-1.5">
                {!it.approved && (
                  <button
                    onClick={() => approveMut.mutate(it.id)}
                    disabled={approveMut.isPending}
                    className="flex-1 py-1.5 rounded-lg bg-green-900/20 hover:bg-green-900/40 text-green-400 text-[10px] border border-green-800/30 transition-colors disabled:opacity-40"
                  >
                    Approve
                  </button>
                )}
                <button
                  onClick={() => archiveMut.mutate(it.id)}
                  disabled={archiveMut.isPending}
                  className="flex-1 py-1.5 rounded-lg bg-red-900/20 hover:bg-red-900/40 text-red-400 text-[10px] border border-red-800/30 transition-colors disabled:opacity-40"
                >
                  Archive
                </button>
              </div>
            </div>
          </div>
        ))}
        {!isLoading && data?.items.length === 0 && (
          <div className="col-span-full text-center text-white/30 text-sm py-10">No items found</div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<"overview" | "users" | "items">("overview");

  const { data: statsData } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const r = await api.get("/api/v1/admin/stats");
      return r.data as { stats: AdminStats; recentUsers: any[] };
    },
    enabled: user?.role === "ADMIN",
  });

  if (loading) return null;
  if (user?.role !== "ADMIN") {
    router.replace("/describe");
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">⚙️ <span>Admin Panel</span></h1>
        <p className="text-white/40 text-sm mt-1">Manage users, moderate content, and track platform stats</p>
      </div>

      {/* Tab navigation */}
      <div className="flex rounded-xl overflow-hidden border border-white/10 w-fit">
        {([
          { key: "overview", label: "📊 Overview" },
          { key: "users", label: "👥 Users" },
          { key: "items", label: "👗 Items" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-5 py-2.5 text-sm font-medium transition-colors ${tab === key ? "bg-amber-600 text-white" : "bg-white/5 text-white/50 hover:text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === "overview" && statsData && (
        <div className="space-y-6">
          <StatsPanel stats={statsData.stats} />
          <div className="grid lg:grid-cols-2 gap-6">
            {statsData.stats.itemsBySection?.length > 0 && (
              <SectionBreakdown data={statsData.stats.itemsBySection} />
            )}
            {statsData.recentUsers?.length > 0 && (
              <div className="bg-slate-800/50 rounded-2xl border border-white/5 p-5">
                <h3 className="text-white font-semibold text-sm mb-4">Recent Signups</h3>
                <div className="space-y-3">
                  {statsData.recentUsers.map((u: any) => (
                    <div key={u.id} className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-purple-600/60 flex items-center justify-center text-white text-xs font-bold">
                        {u.name?.[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-white text-xs font-medium">{u.name}</p>
                        <p className="text-white/30 text-[10px] truncate">{u.email}</p>
                      </div>
                      <span className="text-white/30 text-[10px] ml-auto flex-shrink-0">{new Date(u.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "users" && <UsersPanel />}
      {tab === "items" && <ItemsPanel />}
    </div>
  );
}
