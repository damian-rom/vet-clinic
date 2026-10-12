'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Check } from 'lucide-react';
import type { Appointment } from '@vet-clinic/types';
import { api } from '@/lib/api';
import { Button } from '@/components/button';
import { useVet } from '@/components/context';
import { ActivesEditor } from '@/modules/appointments/forms/actives-editor';
export function CompleteForm({ appointment }: { appointment: Appointment }) {
  const translate = useTranslations('clinic');
  const { busy, run } = useVet();
  const [actives, setActives] = useState(appointment.plan?.estimatedActives || []);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () =>
            api(`appointments/${appointment.id}/complete`, {
              actualActives: actives,
              revision: appointment.revision,
            }),
          translate('visitCompletedActualSuppliesDeductedFromInventory'),
        );
      }}
    >
      <p className="info-box">
        {translate('confirmTheSuppliesActuallyUsedThisRecordsAStockMovementForEach')}
      </p>
      <ActivesEditor value={actives} onChange={setActives} />
      <Button disabled={busy} type="submit">
        <Check size={16} />
        {translate('markVisitDone')}
      </Button>
    </form>
  );
}
