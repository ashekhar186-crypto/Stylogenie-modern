"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import ChatPanel from "@/app/dashboard/(member)/chat/ChatPanel";       // NEW proper chat
import PredictPanel from "@/app/dashboard/(member)/predict/PredictPanel";
import WardrobeGrid from "@/components/wardrobe/WardrobeGrid";         // new wardrobe grid

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="chat" className="w-full">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="chat">AI Fashion Chat</TabsTrigger>
            <TabsTrigger value="predict">Get Predicted</TabsTrigger>
            <TabsTrigger value="wardrobe">Wardrobe</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="chat" className="mt-4">
          <ChatPanel />
        </TabsContent>

        <TabsContent value="predict" className="mt-4">
          <PredictPanel />
        </TabsContent>

        <TabsContent value="wardrobe" className="mt-4">
          <WardrobeGrid />
        </TabsContent>
      </Tabs>
    </div>
  );
}
