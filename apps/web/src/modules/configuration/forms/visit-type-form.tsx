'use client';
import { useTranslations } from 'next-intl';
import type { VisitType } from '@vet-clinic/types';
import { api } from '@/lib/api';
import { Button } from '@/components/button';
import { Field, formValues } from '@/components/common';
import { useVet } from '@/components/context';
export function VisitTypeForm({ type }: { type?: VisitType }) {
  const translate = useTranslations('clinic');
  const { run, busy } = useVet();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () =>
            api(
              type ? `visit-types/${type.id}` : 'visit-types',
              formValues(e.currentTarget),
              type ? 'PATCH' : 'POST',
            ),
          translate('visitTypeSaved'),
        );
      }}
    >
      <Field label={translate('visitTypeName')}>
        <input name="name" defaultValue={type?.name} required maxLength={100} />
      </Field>
      <Button disabled={busy} type="submit">
        {translate('saveVisitType')}
      </Button>
    </form>
  );
}
