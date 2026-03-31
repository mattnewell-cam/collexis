import AuthGate from '@/components/auth/AuthGate';
import NavBar from '@/components/NavBar';

export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGate mode="app">
      <div className="min-h-screen bg-white">
        <NavBar />
        {children}
      </div>
    </AuthGate>
  );
}
