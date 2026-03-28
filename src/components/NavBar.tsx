'use client';

import { usePathname } from 'next/navigation';

export default function NavBar() {
  const pathname = usePathname();
  const isConsole = pathname.startsWith('/console');

  return (
    <nav className="w-full bg-white border-b border-gray-200 shadow-sm h-14 flex items-center px-6">
      <div className="flex items-center justify-between w-full max-w-6xl mx-auto">
        {/* Wordmark */}
        <span
          className="text-xl font-bold tracking-tight"
          style={{
            background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Collexis
        </span>

        {/* Tabs */}
        <div className="flex items-center gap-1">
          <button
            className={`relative px-4 py-1.5 text-sm font-medium transition-colors ${
              isConsole ? 'text-[#1e9bb8]' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Jobs
            {isConsole && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                style={{ background: 'linear-gradient(135deg, #2abfaa 0%, #1e9bb8 100%)' }}
              />
            )}
          </button>
          <button
            className="px-4 py-1.5 text-sm font-medium text-gray-400 opacity-40 cursor-not-allowed pointer-events-none"
            tabIndex={-1}
            aria-disabled="true"
          >
            Communications
          </button>
        </div>
      </div>
    </nav>
  );
}
