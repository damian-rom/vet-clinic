'use client';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { Button } from '@/components/button';
import { Field, formValues } from '@/components/common';
import { useVet } from '@/components/context';
export function ProductForm() {
  const translate = useTranslations('clinic');
  const { run, busy } = useVet();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () => api('products', formValues(e.currentTarget)),
          translate('productCreatedRecordADeliveryToAddStock'),
        );
      }}
    >
      <Field label={translate('productName')}>
        <input name="name" required maxLength={100} placeholder={translate('vaccineDose')} />
      </Field>
      <Field label={translate('unit')}>
        <input name="unit" required maxLength={30} placeholder={translate('doseMlKit')} />
      </Field>
      <Button type="submit" disabled={busy}>
        {translate('createProduct')}
      </Button>
    </form>
  );
}
