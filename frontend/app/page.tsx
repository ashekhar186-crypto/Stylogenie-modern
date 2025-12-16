'use client';
import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

export default function Home() {
  const [ok, setOk] = useState<'checking...' | 'OK' | 'down'>('checking...');

  const check = () => {
    fetch(`${API_BASE}/api/v1/health`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => setOk(d.ok ? 'OK' : 'down'))
      .catch(() => setOk('down'));
  };

  useEffect(() => { check(); }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>System Status</CardTitle>
          <Badge variant={ok === 'OK' ? 'default' : 'destructive'}>{ok}</Badge>
        </CardHeader>
        <CardContent>
          <p className="text-sm opacity-80">API base: <b>{API_BASE}</b></p>
          <div className="mt-4">
            <Button onClick={check}>Recheck</Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="member" className="w-full">
        <TabsList>
          <TabsTrigger value="member">Member</TabsTrigger>
          <TabsTrigger value="admin">Admin</TabsTrigger>
        </TabsList>
        <TabsContent value="member" className="mt-4">
          <Card><CardContent className="pt-6">Member area (Chat, Get Predicted, Wardrobe)</CardContent></Card>
        </TabsContent>
        <TabsContent value="admin" className="mt-4">
          <Card><CardContent className="pt-6">Admin area (Users, Stats, Jobs)</CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
