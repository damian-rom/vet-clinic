'use client';
import { useTranslations } from 'next-intl';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { dateLabel } from '@/lib/time';
import { Button } from '@/components/button';
import { Empty, PageHeading } from '@/components/common';
import { useVet } from '@/components/context';
import { VisitTypeForm } from '@/modules/configuration/forms/visit-type-form';
import { BlockForm } from '@/modules/configuration/forms/time-block-form';
export function Configuration() {
  const translate = useTranslations('clinic');
  const { data, open, run, busy } = useVet();
  return (
    <>
      <PageHeading
        eyebrow={translate('aClinicThatRunsYourWay')}
        title={translate('configuration')}
        text={translate('manageTheVisitTypesAndUnavailableTimesUsedThroughoutTheClinic')}
      />
      <div className="config-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>{translate('visitTypes')}</h2>
            <Button
              size="sm"
              onClick={() =>
                open(
                  translate('newVisitType'),
                  translate('aCategoryForVisitPlanningAndAiDrafts'),
                  <VisitTypeForm />,
                )
              }
            >
              <Plus size={14} />
              {translate('addType')}
            </Button>
          </div>
          <div className="config-list">
            {data.visitTypes.map((t) => (
              <div key={t.id}>
                <span>
                  <strong>{t.name}</strong>
                  {t.retired && <small>{translate('retired2')}</small>}
                </span>
                <div className="card-actions">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={translate('renameValue0', { value0: t.name ?? '' })}
                    onClick={() =>
                      open(
                        translate('renameVisitType'),
                        translate('existingVisitsKeepTheirRelationshipToThisType'),
                        <VisitTypeForm type={t} />,
                      )
                    }
                  >
                    <Pencil size={15} />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          api(
                            `visit-types/${t.id}`,
                            { name: t.name, retired: !t.retired },
                            'PATCH',
                          ),
                        t.retired ? translate('visitTypeRestored') : translate('visitTypeRetired'),
                        false,
                      )
                    }
                  >
                    {t.retired ? translate('restore') : translate('retire')}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={busy}
                    aria-label={translate('deleteValue0', { value0: t.name ?? '' })}
                    onClick={() =>
                      open(
                        translate('deleteUnusedVisitType'),
                        translate('typesWithHistoryCannotBeDeletedRetireThemInstead'),
                        <Button
                          variant="destructive"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => api(`visit-types/${t.id}`, {}, 'DELETE'),
                              translate('unusedVisitTypeDeleted'),
                            )
                          }
                        >
                          {translate('deleteVisitType')}
                        </Button>,
                      )
                    }
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>{translate('clinicHours')}</h2>
          </div>
          <dl className="pet-details">
            <div>
              <dt>{translate('days')}</dt>
              <dd>{translate('mondayFriday')}</dd>
            </div>
            <div>
              <dt>{translate('openingHours')}</dt>
              <dd>09:00–18:00</dd>
            </div>
            <div>
              <dt>{translate('bookingSlots')}</dt>
              <dd>{translate('30Minutes')}</dd>
            </div>
            <div>
              <dt>{translate('timezone')}</dt>
              <dd>{data.clinic.timezone}</dd>
            </div>
          </dl>
          <p className="muted small">
            {translate('openingHoursAndSlotLengthAreFixedForThisRelease')}
          </p>
        </section>
      </div>
      <section className="panel section">
        <div className="section-heading">
          <h2>{translate('timeBlocks')}</h2>
          <Button
            onClick={() =>
              open(
                translate('blockClinicTime'),
                translate('setAClosingRangeOrWholeDays'),
                <BlockForm />,
              )
            }
          >
            <Plus size={16} />
            {translate('addBlock')}
          </Button>
        </div>
        {data.timeBlocks.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{translate('start')}</th>
                  <th>{translate('end')}</th>
                  <th>{translate('reason')}</th>
                  <th>{translate('action')}</th>
                </tr>
              </thead>
              <tbody>
                {data.timeBlocks.map((b) => (
                  <tr key={b.id}>
                    <td>{dateLabel(b.startsAt, data.clinic.timezone)}</td>
                    <td>{dateLabel(b.endsAt, data.clinic.timezone)}</td>
                    <td>{b.reason || 'Unavailable'}</td>
                    <td>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          open(
                            translate('removeThisTimeBlock'),
                            translate('thisTimeWillBecomeAvailableForBookingAgain'),
                            <Button
                              disabled={busy}
                              variant="destructive"
                              onClick={() =>
                                void run(
                                  () => api(`time-blocks/${b.id}`, {}, 'DELETE'),
                                  translate('timeBlockRemoved'),
                                )
                              }
                            >
                              {translate('removeBlock')}
                            </Button>,
                          )
                        }
                      >
                        {translate('remove')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={translate('noClosingRanges')}
            text={translate('addATimeBlockForAHolidayLunchOrAnotherUnavailablePeriod')}
          />
        )}
      </section>
    </>
  );
}
