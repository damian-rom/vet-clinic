'use client';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/button';
import { Empty, PageHeading } from '@/components/common';
import { useVet } from '@/components/context';
import { draftAppointments } from '@/modules/appointments/services';
import { AppointmentTable } from '@/modules/appointments/list/appointment-table';
import { LoadOlder } from '@/modules/appointments/list/load-older';
export function AppointmentList() {
  const translate = useTranslations('clinic');
  const { data, busy, run } = useVet();
  const [filter, setFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const appointments = data.appointments
    .filter(
      (a) =>
        (filter === 'all' ||
          (filter === 'active'
            ? !['Done', 'Cancelled'].includes(a.status)
            : a.status === filter)) &&
        `${data.pets.find((p) => p.id === a.petId)?.name} ${a.symptoms} ${data.owners.find((u) => u.id === a.ownerId)?.name}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => (a.scheduledAt || '').localeCompare(b.scheduledAt || ''));
  // Closed visits read newest first; "Load older visits" extends them further back.
  if (filter === 'Done' || filter === 'Cancelled') appointments.reverse();
  return (
    <>
      <PageHeading
        eyebrow={translate('aClearPlanForEveryVisit2')}
        title={translate('appointments')}
        text={translate('takeOnAVisitReviewItsPlanAndKeepCareMoving')}
        actions={
          <Button
            disabled={busy || !selected.length || !data.aiAvailable}
            onClick={() =>
              void run(
                () => draftAppointments(selected),
                translate('batchDraftingCompleteHumanPlansWerePreserved'),
                false,
              )
            }
          >
            <Sparkles size={17} />
            {translate('draftSelected')}
            {selected.length})
          </Button>
        }
      />
      <div className="toolbar">
        <input
          aria-label={translate('searchAppointments')}
          placeholder={translate('searchPetOwnerOrSymptoms')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label={translate('appointmentStatus')}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setSelected([]);
          }}
        >
          {[
            'active',
            'AwaitingConfirmation',
            'Confirmed',
            'NeedsTime',
            'Done',
            'Cancelled',
            'all',
          ].map((s) => (
            <option value={s} key={s}>
              {s === 'active'
                ? translate('activeVisits')
                : s === 'all'
                  ? translate('allVisits')
                  : translate(s.charAt(0).toLowerCase() + s.slice(1))}
            </option>
          ))}
        </select>
      </div>
      {appointments.length ? (
        <AppointmentTable
          appointments={appointments}
          selectable
          selected={selected}
          onSelect={setSelected}
        />
      ) : (
        <Empty
          title={translate('theListIsClear')}
          text={translate('appointmentsWillAppearHereWhenOwnersBookOrCasesNeedANext')}
        />
      )}
      {['Done', 'Cancelled', 'all'].includes(filter) && <LoadOlder />}
    </>
  );
}
