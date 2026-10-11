'use client';

import { api } from '@/lib/api';

export async function draftAppointments(ids: string[]) {
  const result = await api<{ results: { id: string; outcome: string; message?: string }[] }>(
    'ai/draft',
    { appointmentIds: ids },
  );
  const failed = result.results.filter((r) => r.outcome === 'failed');
  if (failed.length)
    throw new Error(
      `${result.results.filter((r) => r.outcome === 'drafted').length} drafted, ${result.results.filter((r) => r.outcome === 'skipped').length} skipped, ${failed.length} failed. ${failed.map((r) => r.message).join(' ')}`,
    );
  return result;
}
