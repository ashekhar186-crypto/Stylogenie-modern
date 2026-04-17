"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Dashboard is now split into 4 dedicated feature pages.
// Redirect legacy /dashboard path to the main Describer page.
export default function DashboardRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/describe"); }, [router]);
  return null;
}
