import './globals.css';
import Providers from './providers/providers';
import { AuthProvider } from './providers/auth';

export const metadata = {
  title: 'StyloGenie',
  description: 'AI wardrobe and outfit assistant',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <AuthProvider>
            {children}
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
