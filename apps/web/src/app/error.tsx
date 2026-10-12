'use client';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/button';
export default function ErrorPage({ reset }: { reset: () => void }) {
  const translate = useTranslations('clinic');
  return (
    <main className="loading">
      <h1>{translate('theWorkspaceCouldnTLoad')}</h1>
      <p>{translate('yourSavedClinicRecordsAreSafeTryOpeningTheWorkspaceAgain')}</p>
      <Button onClick={reset}>{translate('tryAgain')}</Button>
    </main>
  );
}
