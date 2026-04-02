import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthProvider } from '@/components/auth/AuthProvider';
import RouteLogger from '@/components/RouteLogger';
import './globals.css';

export const metadata: Metadata = {
  title: "Collexis",
  description: "Trade & service debt collection",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">
        <AuthProvider>
          <Suspense fallback={null}>
            <RouteLogger />
          </Suspense>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
