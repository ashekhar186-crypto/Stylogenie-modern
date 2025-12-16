'use client';

import { Card, CardContent } from "@/components/ui/card";

export default function AuthCard({
  children,
  title,
}: { children: React.ReactNode; title: string }) {
  return (
    <div className="min-h-[calc(100vh-64px)] grid place-items-center px-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardContent className="pt-6">
          <h1 className="text-xl font-semibold mb-4 text-center">{title}</h1>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}
