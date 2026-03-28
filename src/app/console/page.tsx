import NavBar from '@/components/NavBar';
import JobsTable from '@/components/JobsTable';
import { mockJobs } from '@/data/mockJobs';

export default function ConsolePage() {
  return (
    <div className="min-h-screen bg-white">
      <NavBar />
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Jobs</h1>
          <p className="text-sm text-gray-500 mt-1">{mockJobs.length} outstanding invoices</p>
        </div>
        <JobsTable jobs={mockJobs} />
      </main>
    </div>
  );
}
