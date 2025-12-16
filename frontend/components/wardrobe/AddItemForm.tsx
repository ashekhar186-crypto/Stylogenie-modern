"use client";

import * as React from "react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { createItem } from "@/lib/items";

/* ---------- literals & types ---------- */
const sections = [
  "Tops",
  "Bottoms",
  "Dresses",
  "Outerwear",
  "Footwear",
  "Accessories",
  "Ethnicwear",
  "Sportswear",
] as const;

const seasons = ["Spring", "Summer", "Autumn", "Winter"] as const;

const occasions = ["Casual", "Formal", "Sports", "Party", "Ethnic"] as const;

type SectionT = (typeof sections)[number];
type SeasonT = (typeof seasons)[number];
type OccasionT = (typeof occasions)[number];

/* ---------- small helper, OUTSIDE the component ---------- */
function extractApiError(data: unknown): string | undefined {
  if (typeof data === "object" && data !== null && "error" in data) {
    const v = (data as Record<string, unknown>).error;
    if (typeof v === "string") return v;
  }
  return undefined;
}

/* ---------- component ---------- */
export default function AddItemForm() {
  const qc = useQueryClient();

  const [imageUrl, setImageUrl] = useState("");
  const [title, setTitle] = useState("");
  const [brand, setBrand] = useState("");
  const [section, setSection] = useState<SectionT | undefined>();
  const [season, setSeason] = useState<SeasonT | undefined>();
  const [occasion, setOccasion] = useState<OccasionT | undefined>();

  const mut = useMutation({
    mutationFn: async () =>
      createItem({
        imageUrl,
        title: title || undefined,
        brand: brand || undefined,
        section,
        season,
        occasion,
      }),
    onSuccess: () => {
      toast.success("Item added");
      setImageUrl("");
      setTitle("");
      setBrand("");
      setSection(undefined);
      setSeason(undefined);
      setOccasion(undefined);
      qc.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (err: unknown) => {
      const message = isAxiosError(err)
        ? extractApiError(err.response?.data) ?? err.message
        : err instanceof Error
        ? err.message
        : "Failed to add item";
      toast.error(message);
    },
  });

  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Input
        placeholder="Image URL (https://...)"
        value={imageUrl}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setImageUrl(e.target.value)
        }
      />
      <Input
        placeholder="Title (optional)"
        value={title}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setTitle(e.target.value)
        }
      />
      <Input
        placeholder="Brand (optional)"
        value={brand}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setBrand(e.target.value)
        }
      />

      <Select
        value={section}
        onValueChange={(v) => setSection(v as SectionT)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Section" />
        </SelectTrigger>
        <SelectContent>
          {sections.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={season} onValueChange={(v) => setSeason(v as SeasonT)}>
        <SelectTrigger>
          <SelectValue placeholder="Season" />
        </SelectTrigger>
        <SelectContent>
          {seasons.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={occasion}
        onValueChange={(v) => setOccasion(v as OccasionT)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Occasion" />
        </SelectTrigger>
        <SelectContent>
          {occasions.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        className="md:col-span-3"
        onClick={() => mut.mutate()}
        disabled={!imageUrl || mut.isPending}
      >
        {mut.isPending ? "Adding..." : "Add item"}
      </Button>
    </div>
  );
}
