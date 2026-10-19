'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Package, Plus } from 'lucide-react';
import { dateLabel } from '@/lib/time';
import { Button } from '@/components/button';
import { Empty, PageHeading } from '@/components/common';
import { useVet } from '@/components/context';
import { AppointmentDetail } from '@/modules/appointments/details/appointment-detail';
import { ProductForm } from '@/modules/inventory/forms/product-form';
import { MovementForm } from '@/modules/inventory/forms/movement-form';
export function Inventory() {
  const translate = useTranslations('clinic');
  const { data, busy, open } = useVet();
  const [productFilter, setProductFilter] = useState('');
  const low = data.products.filter((p) => p.needed > p.stock);
  const movements = [...data.movements]
    .filter((m) => !productFilter || m.productId === productFilter)
    .reverse();
  return (
    <>
      <PageHeading
        eyebrow={translate('theRightSuppliesAtTheRightTime')}
        title={translate('inventory')}
        text={translate('everyStockNumberHasAStoryEveryMovementStaysOnRecord')}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                open(
                  translate('createAProduct'),
                  translate('startWithANameAndUnitStockIsAddedThroughMovements'),
                  <ProductForm />,
                )
              }
            >
              <Plus size={17} />
              {translate('newProduct')}
            </Button>
            <Button
              disabled={!data.products.length}
              onClick={() =>
                open(
                  translate('recordAStockMovement'),
                  translate('receivedStockAndCorrectionsKeepTheCountTrueToTheShelf'),
                  <MovementForm />,
                )
              }
            >
              <ArrowDownLeft size={17} />
              {translate('recordMovement')}
            </Button>
          </>
        }
      />
      <div className="stats">
        <div>
          <Package />
          <strong>{data.products.length}</strong>
          <span>{translate('productsTracked')}</span>
        </div>
        <div>
          <AlertTriangle />
          <strong>{low.length}</strong>
          <span>{translate('upcomingShortfalls')}</span>
        </div>
        <div>
          <ArrowUpRight />
          <strong>{data.movements.length}</strong>
          <span>{translate('recordedMovements')}</span>
        </div>
      </div>
      {data.products.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{translate('product')}</th>
                <th>{translate('inStock3')}</th>
                <th>{translate('neededByUpcomingVisits')}</th>
                <th>{translate('outlook')}</th>
                <th>{translate('action')}</th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    <small>
                      {translate('unit2')} {p.unit}
                    </small>
                  </td>
                  <td>
                    {p.stock} {p.unit}
                  </td>
                  <td>
                    {p.needed} {p.unit}
                  </td>
                  <td>
                    {p.needed > p.stock ? (
                      <span className="stock-warning">
                        {translate('shortBy')} {Math.round((p.needed - p.stock) * 1e8) / 1e8}{' '}
                        {p.unit}
                      </span>
                    ) : (
                      <span className="stock-ok">{translate('covered')}</span>
                    )}
                  </td>
                  <td>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        open(
                          translate('updateValue0Stock', { value0: p.name ?? '' }),
                          translate('allStockChangesAreRecordedWithYourAccountAndTheTime'),
                          <MovementForm product={p} />,
                        )
                      }
                    >
                      {translate('recordMovement')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title={translate('aClearShelfStartsHere')}
          text={translate('createYourFirstProductThenRecordTheStockReceived')}
        />
      )}
      <section className="section">
        <div className="section-heading">
          <h2>{translate('movementHistory')}</h2>
          <select
            aria-label={translate('filterStockHistoryByProduct')}
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
          >
            <option value="">{translate('allProducts')}</option>
            {data.products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        {movements.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{translate('when')}</th>
                  <th>{translate('product')}</th>
                  <th>{translate('movement')}</th>
                  <th>{translate('quantity')}</th>
                  <th>{translate('recordedBy')}</th>
                  <th>{translate('reasonVisit')}</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td className="nowrap">{dateLabel(m.performedAt, data.clinic.timezone)}</td>
                    <td>{data.products.find((p) => p.id === m.productId)?.name}</td>
                    <td>{m.type}</td>
                    <td className={m.quantity < 0 ? 'stock-warning' : 'stock-ok'}>
                      {m.quantity > 0 ? '+' : ''}
                      {m.quantity}
                    </td>
                    <td>
                      {translate('dr')} {data.vets.find((v) => v.id === m.performedBy)?.name}
                    </td>
                    <td>
                      {m.appointmentId ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            open(
                              translate('completedVisit'),
                              translate('theVisitLinkedToThisStockMovement'),
                              <AppointmentDetail id={m.appointmentId!} />,
                            )
                          }
                        >
                          {translate('viewVisit')}
                        </Button>
                      ) : (
                        m.reason || '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">{translate('noMovementsRecordedYet')}</p>
        )}
      </section>
    </>
  );
}
