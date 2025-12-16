"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Item = {
  id: string;
  title: string;
  imageUrl: string | null;
  section: string | null;
  approved: boolean;
  createdAt: string;
};

export default function WardrobeGrid() {
  const q = useQuery({
    queryKey: ["items"],
    queryFn: async () => {
      const r = await api.get("/api/v1/items");
      return r.data?.items as Item[];
    },
  });

  if (q.isLoading) return <div className="opacity-70">Loading wardrobe…</div>;
  if (q.isError) return <div className="text-red-500">Failed to load items.</div>;

  const items = q.data ?? [];

  return (
    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
      {items.map((it) => (
        <Card key={it.id} className="overflow-hidden group">
          {it.imageUrl ? (
            <img
              src={it.imageUrl}
              alt={it.title}
              className="aspect-[4/5] w-full object-cover transition-transform group-hover:scale-[1.02]"
            />
          ) : (
            <div className="aspect-[4/5] w-full bg-muted grid place-items-center text-xs opacity-60">
              No image
            </div>
          )}
          <CardContent className="p-3 space-y-1">
            <div className="text-sm font-medium line-clamp-2">{it.title}</div>
            <div className="text-xs opacity-70">
              {it.section ?? "—"} · {new Date(it.createdAt).toLocaleDateString()}
            </div>
            <div className="pt-2">
              <Button variant="secondary" size="sm">Details</Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {items.length === 0 && (
        <div className="col-span-full opacity-70">No items yet — predict something!</div>
      )}
    </div>
  );
}
