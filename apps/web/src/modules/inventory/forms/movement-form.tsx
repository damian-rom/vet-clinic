'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { Product } from '@vet-clinic/types';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, formValues } from '@/components/common';
import { useVet } from '@/components/context';
export function MovementForm({ product }: { product?: Product }) {
  const translate = useTranslations('clinic');
  const { data, run, busy } = useVet();
  const [type, setType] = useState('Received');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = formValues(e.currentTarget);
        void run(
          () =>
            api('movements', {
              productId: v.productId,
              type,
              quantity: Number(v.quantity),
              ...(v.reason ? { reason: v.reason } : {}),
            }),
          translate('stockMovementRecorded'),
        );
      }}
    >
      <Field label={translate('product')}>
        <select name="productId" defaultValue={product?.id || data.products[0]?.id} required>
          {data.products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.stock} {p.unit}
              {translate('inStock2')}
            </option>
          ))}
        </select>
      </Field>
      <Field label={translate('movement')}>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="Received">{translate('received')}</option>
          <option value="Correction">{translate('correction')}</option>
        </select>
      </Field>
      <Field
        label={
          type === 'Received' ? translate('quantityReceived') : translate('quantityAdjustment')
        }
        hint={
          type === 'Correction'
            ? translate('useAPositiveNumberToAddOrANegativeNumberToSubtract')
            : undefined
        }
      >
        <input
          name="quantity"
          type="number"
          required
          step="any"
          min={type === 'Received' ? '0.00000001' : undefined}
        />
      </Field>
      <Field
        label={type === 'Correction' ? translate('reasonRequired') : translate('noteOptional')}
      >
        <textarea
          name="reason"
          required={type === 'Correction'}
          maxLength={2000}
          placeholder={translate('deliveryReferenceOrReasonForAdjustment')}
        />
      </Field>
      <Button type="submit" disabled={busy || !data.products.length}>
        {translate('recordMovement')}
      </Button>
    </form>
  );
}
