import { api } from "@/lib/api";

export type Item = {
  id: string;
  imageUrl: string;
  title?: string | null;
  brand?: string | null;
  color: string[];
  material?: string | null;
  size?: string | null;
  price?: number | null;
  season?: "Spring" | "Summer" | "Autumn" | "Winter" | null;
  occasion?: "Casual" | "Formal" | "Sports" | "Party" | "Ethnic" | null;
  styleTags: string[];
  notes?: string | null;
  section?: "Tops" | "Bottoms" | "Dresses" | "Outerwear" | "Footwear" | "Accessories" | "Ethnicwear" | "Sportswear" | null;
  predictedLabels: string[];
  confidences: number[];
  approved: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Paginated<T> = { items: T[]; page: number; limit: number; total: number };

export async function fetchItems(page = 1, limit = 24) {
  const r = await api.get<Paginated<Item>>("/api/v1/items", {
    params: { owner: "me", page, limit },
  });
  return r.data;
}

export async function createItem(payload: Partial<Item> & { imageUrl: string }) {
  const r = await api.post<{ item: Item }>("/api/v1/items", payload);
  return r.data.item;
}

export async function approveItem(id: string) {
  const r = await api.post<{ item: Item }>(`/api/v1/items/${id}/approve`);
  return r.data.item;
}

export async function archiveItem(id: string) {
  const r = await api.delete<{ ok: true }>(`/api/v1/items/${id}`);
  return r.data;
}
