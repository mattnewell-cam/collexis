export default function Home() {
  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-white"
      style={{ color: '#1a1a1a' }}
    >
      {/* Background blob — top right */}
      <div
        className="pointer-events-none fixed"
        style={{
          top: '-20%',
          right: '-10%',
          width: '60vw',
          height: '60vw',
          background: 'radial-gradient(circle, rgba(100, 210, 190, 0.12) 0%, transparent 70%)',
        }}
      />
      {/* Background blob — bottom left */}
      <div
        className="pointer-events-none fixed"
        style={{
          bottom: '-20%',
          left: '-10%',
          width: '50vw',
          height: '50vw',
          background: 'radial-gradient(circle, rgba(60, 180, 200, 0.10) 0%, transparent 70%)',
        }}
      />

      {/* Main content */}
      <div className="relative z-10 text-center px-8">
        <h1
          className="font-bold tracking-tight mb-5"
          style={{
            fontSize: 'clamp(3.5rem, 12vw, 7rem)',
            letterSpacing: '-0.03em',
            background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Collexis
        </h1>
        <span
          className="inline-block text-xs font-semibold uppercase px-4 py-1.5 rounded-full"
          style={{
            background: 'linear-gradient(135deg, rgba(42,191,170,0.12), rgba(30,155,184,0.12))',
            border: '1px solid rgba(42,191,170,0.3)',
            color: '#1e9bb8',
            letterSpacing: '0.12em',
          }}
        >
          Coming Soon
        </span>
      </div>

      {/* Footer */}
      <p
        className="fixed bottom-8 text-sm"
        style={{ color: '#bbb', letterSpacing: '0.02em' }}
      >
        &copy; 2026 Collexis
      </p>
    </div>
  );
}
