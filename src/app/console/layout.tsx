import NavBar from '@/components/NavBar';

export default function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white">
      <NavBar />
      {children}
    </div>
  );
}
