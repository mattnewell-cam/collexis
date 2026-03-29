import JobsTable from '@/components/JobsTable';
import BulkUploadButton from '@/components/BulkUploadButton';
import { mockJobs } from '@/data/mockJobs';

const outstandingJobs = mockJobs.filter(j => j.status !== 'Paid' && j.status !== 'Abandoned');
const pastJobs = mockJobs.filter(j => j.status === 'Paid' || j.status === 'Abandoned');

export default function ConsolePage() {
  return (
      <main className="max-w-6xl mx-auto px-6 py-8 space-y-10">
        <section>
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Outstanding</h2>
            <p className="text-sm text-gray-500 mt-0.5">{outstandingJobs.length} unpaid invoices</p>
          </div>
          <JobsTable jobs={outstandingJobs} actions={<BulkUploadButton />} />
        </section>

        <section>
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Past Jobs</h2>
            <p className="text-sm text-gray-500 mt-0.5">{pastJobs.length} completed or abandoned</p>
          </div>
          <JobsTable jobs={pastJobs} />
        </section>
      </main>
  );
}
