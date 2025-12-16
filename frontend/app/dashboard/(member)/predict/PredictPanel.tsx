"use client";

import * as React from "react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import axios from "axios";

import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

function extractApiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data as { error?: string } | undefined;
    return d?.error ?? err.message;
  }
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

export default function PredictPanel() {
  const qc = useQueryClient();

  const [imageUrl, setImageUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "predicting" | "done" | "error">("idle");
  const [resultText, setResultText] = useState<string>("");
  const [section, setSection] = useState<string | undefined>(undefined);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f) {
      const url = URL.createObjectURL(f);
      setPreview(url);
      setImageUrl("");
    } else setPreview("");
  }

  async function handlePredictFromUrl() {
    if (!imageUrl) return toast.error("Paste direct image URL or file upload first.");

    setLoading(true);
    setStatus("predicting");
    setResultText("");
    setSection(undefined);

    try {
      const r = await api.post("/api/v1/predict", {
        imageUrl,
        saveItem: true,
      });

      setResultText(r.data?.text ?? "");
      setSection(r.data?.section ?? undefined);
      qc.invalidateQueries({ queryKey: ["items"] });

      setStatus("done");
      toast.success("Predicted & saved to Wardrobe");
    } catch (err: unknown) {
      toast.error(extractApiError(err));
      setStatus("error");
    } finally {
      setLoading(false);
    }
  }

  async function handlePredictFromUpload() {
    if (!file) return toast.error("Choose an image file first.");

    setLoading(true);
    setStatus("predicting");
    setResultText("");
    setSection(undefined);

    try {
      const form = new FormData();
      form.append("image", file);
      form.append("saveItem", "true");

      const r = await api.post("/api/v1/predict/upload", form);

      setResultText(r.data?.text ?? "");
      setSection(r.data?.section ?? undefined);
      setPreview(r.data?.imageUrl || preview);

      qc.invalidateQueries({ queryKey: ["items"] });
      setStatus("done");
      toast.success("Predicted & saved to Wardrobe");
    } catch (err: unknown) {
      toast.error(extractApiError(err));
      setStatus("error");
    } finally {
      setLoading(false);
    }
  }

  const progress =
    status === "predicting" ? 70 :
    status === "done" ? 100 :
    status === "error" ? 100 : 0;

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">

        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <Input
            placeholder="Image URL (https://...)"
            value={imageUrl}
            onChange={(e) => {
              setImageUrl(e.target.value);
              if (e.target.value) { setFile(null); setPreview(""); }
            }}
          />
          <Button onClick={handlePredictFromUrl} disabled={loading || !imageUrl}>
            {loading ? "Predicting..." : "Predict from URL + Save"}
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <Input type="file" accept="image/*" onChange={onFileChange} />
          <Button onClick={handlePredictFromUpload} disabled={loading || !file}>
            {loading ? "Predicting..." : "Upload & Predict + Save"}
          </Button>
        </div>

        {(status !== "idle") && <Progress value={progress} />}

        {(preview || imageUrl) && (
          <div className="mt-2">
            <img
              src={preview || imageUrl}
              alt="preview"
              className="max-h-64 rounded border object-contain"
            />
          </div>
        )}

        {resultText && (
          <div className="rounded border p-3 text-sm">
            <div className="font-medium mb-1">Prediction</div>
            <div>{resultText}</div>
            {section && <div className="mt-1 text-xs opacity-70">Section: {section}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
