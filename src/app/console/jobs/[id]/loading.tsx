export default function Loading() {
  return (
    <div className="flex" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <aside className="w-60 shrink-0 border-r border-gray-200 bg-gray-50" />
      <main className="flex-1 min-w-0 bg-[#f8fbfc] px-6 py-6 lg:px-8 lg:py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-10 w-48 rounded-2xl bg-gray-200" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="h-32 rounded-2xl bg-white" />
            <div className="h-32 rounded-2xl bg-white" />
            <div className="h-32 rounded-2xl bg-white" />
            <div className="h-32 rounded-2xl bg-white" />
          </div>
          <div className="h-[60vh] rounded-3xl bg-white" />
        </div>
      </main>
    </div>
  );
}
