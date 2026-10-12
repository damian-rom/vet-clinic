'use client';
import { useTranslations } from 'next-intl';
import type { Appointment } from '@vet-clinic/types';
import { dateLabel } from '@/lib/time';
import { Button } from '@/components/button';
import { Status } from '@/components/common';
import { useVet } from '@/components/context';
import { AppointmentDetail } from '@/modules/appointments/details/appointment-detail';
export function AppointmentTable({
  appointments,
  selectable = false,
  selected = [],
  onSelect,
}: {
  appointments: Appointment[];
  selectable?: boolean;
  selected?: string[];
  onSelect?: (ids: string[]) => void;
}) {
  const translate = useTranslations('clinic');
  const { data, open } = useVet();
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {selectable && (
              <th>
                <input
                  type="checkbox"
                  aria-label={translate('selectAllVisibleAppointments')}
                  checked={
                    appointments.length > 0 && appointments.every((a) => selected.includes(a.id))
                  }
                  onChange={(e) =>
                    onSelect?.(e.target.checked ? appointments.map((a) => a.id) : [])
                  }
                />
              </th>
            )}
            <th>{translate('petOwner2')}</th>
            <th>{translate('dateTime')}</th>
            <th>{translate('reasonForVisit')}</th>
            <th>{translate('status')}</th>
            <th>{translate('veterinarian')}</th>
            <th>{translate('plan')}</th>
            <th>
              <span className="sr-only">{translate('details')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {appointments.map((a) => {
            const pet = data.pets.find((p) => p.id === a.petId);
            return (
              <tr key={a.id}>
                {selectable && (
                  <td>
                    <input
                      type="checkbox"
                      aria-label={translate('selectValue0Appointment', { value0: pet?.name ?? '' })}
                      checked={selected.includes(a.id)}
                      onChange={(e) =>
                        onSelect?.(
                          e.target.checked
                            ? [...selected, a.id]
                            : selected.filter((id) => id !== a.id),
                        )
                      }
                    />
                  </td>
                )}
                <td>
                  <strong>{pet?.name}</strong>
                  <small>{data.owners.find((o) => o.id === a.ownerId)?.name}</small>
                </td>
                <td className="nowrap">{dateLabel(a.scheduledAt, data.clinic.timezone)}</td>
                <td className="reason-cell" title={a.symptoms}>
                  {a.symptoms}
                </td>
                <td>
                  <Status status={a.status} />
                </td>
                <td>
                  {data.vets.find((v) => v.id === a.vetId)?.name || translate('notYetAssigned')}
                </td>
                <td>
                  <span className={`plan-badge ${a.plan?.source || 'empty-plan'}`}>
                    {a.plan?.source === 'ai-draft'
                      ? translate('filledByAi')
                      : a.plan?.source === 'ai-reviewed'
                        ? translate('aiReviewed')
                        : a.plan
                          ? translate('planned')
                          : translate('notPlanned')}
                  </span>
                </td>
                <td>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      open(
                        translate('appointment'),
                        translate('visitDetailsAndTheClinicalPlan'),
                        <AppointmentDetail id={a.id} />,
                      )
                    }
                  >
                    {translate('open')}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
