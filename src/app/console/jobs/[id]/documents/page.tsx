import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import JobDocumentsView from '@/components/JobDocumentsView';
import { findJobById } from '@/lib/jobStore';

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const job = await findJobById(id, supabase);

  if (!job) notFound();

  return <JobDocumentsView jobId={id} />;
}
