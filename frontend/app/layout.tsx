import './globals.css';
import Providers from './providers/providers';
import { AuthProvider } from './providers/auth';
import AppShell from '@/components/layout/AppShell';
import type { Viewport } from 'next';

export const metadata = {
  title: 'StyloGenie — AI Fashion System',
  description: 'Your AI-powered wardrobe, stylist, and travel fashion planner',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'StyloGenie',
  },
};

// themeColor must be in viewport export (Next.js 14+)
export const viewport: Viewport = {
  themeColor: '#7c3aed',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>
          <AuthProvider>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
