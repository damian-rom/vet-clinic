'use client';
import { useTranslations } from 'next-intl';
import { History } from 'lucide-react';
import { Button } from '@/components/button';
import { useVet } from '@/components/context';

/** The workspace carries 30 days of closed visits; this pages in older ones. */
export function LoadOlder({ petId }: { petId?: string }) {
  const translate = useTranslations('clinic');
  const { busy, history, run } = useVet();
  if (!history.more(petId)) return null;
  return (
    <div className="load-older">
      <span className="muted">{translate('closedVisitsFromTheLast30DaysAreShown')}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void run(() => history.load(petId), translate('olderVisitsLoaded'), false)}
      >
        <History size={15} />
        {translate('loadOlderVisits')}
      </Button>
    </div>
  );
}
