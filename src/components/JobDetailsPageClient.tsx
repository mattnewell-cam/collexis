'use client';

import JobDetailsForm from '@/components/JobDetailsForm';
import { useJobRouteCache } from '@/components/JobRouteCacheProvider';

export default function JobDetailsPageClient() {
  const { job } = useJobRouteCache();

  return (
    <div className="overflow-y-auto h-full">
      <JobDetailsForm job={job} />
    </div>
  );
}
