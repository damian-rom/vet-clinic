'use client';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import type { EstimatedActive } from '@vet-clinic/types';
import { Button } from '@/components/ui/button';
import { useVet } from '@/components/context';
export function ActivesEditor({
  value,
  onChange,
}: {
  value: EstimatedActive[];
  onChange: (items: EstimatedActive[]) => void;
}) {
  const translate = useTranslations('clinic');
  const { data } = useVet();
  return (
    <fieldset className="actives-editor">
      <legend>{translate('medicationsSupplies')}</legend>
      {value.map((item, i) => {
        const product = data.products.find((p) => p.id === item.productId);
        return (
          <div key={i} className="active-row">
            <select
              aria-label={translate('productValue0', { value0: i + 1 })}
              value={item.productId}
              required
              onChange={(e) =>
                onChange(value.map((v, j) => (j === i ? { ...v, productId: e.target.value } : v)))
              }
            >
              <option value="">{translate('chooseProduct')}</option>
              {data.products
                .filter((p) => p.id === item.productId || !value.some((v) => v.productId === p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.unit})
                  </option>
                ))}
            </select>
            <input
              aria-label={translate('quantityValue0', { value0: i + 1 })}
              type="number"
              min="0.00000001"
              step="any"
              required
              value={item.quantity || ''}
              onChange={(e) =>
                onChange(
                  value.map((v, j) => (j === i ? { ...v, quantity: Number(e.target.value) } : v)),
                )
              }
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={translate('removeProductValue0', { value0: i + 1 })}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              ×
            </Button>
            {product && (
              <small className={item.quantity > product.stock ? 'stock-warning' : 'muted'}>
                {translate('inStock')}
                {product.stock} {product.unit}
                {item.quantity > product.stock ? translate('exceedsStock') : ''}
              </small>
            )}
          </div>
        );
      })}
      <Button
        variant="outline"
        size="sm"
        type="button"
        disabled={value.length >= data.products.length}
        onClick={() =>
          onChange([
            ...value,
            {
              productId:
                data.products.find((p) => !value.some((v) => v.productId === p.id))?.id || '',
              quantity: 1,
            },
          ])
        }
      >
        <Plus size={14} />
        {translate('addProduct')}
      </Button>
      {!data.products.length && (
        <small className="muted">{translate('addInventoryProductsBeforeEstimatingSupplies')}</small>
      )}
    </fieldset>
  );
}
