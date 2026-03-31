import type { Job } from '@/types/job';

export function toApiJobSnapshot(job: Job) {
  return {
    id: job.id,
    name: job.name,
    address: job.address,
    job_description: job.jobDescription,
    job_detail: job.jobDetail,
    due_date: job.dueDate || null,
    price: job.price,
    amount_paid: job.amountPaid,
    days_overdue: job.daysOverdue,
    status: job.status,
    emails: job.emails,
    phones: job.phones,
    context_instructions: job.contextInstructions,
  };
}
