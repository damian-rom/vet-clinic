'use client';
import { useTranslations } from 'next-intl';
import type { Pet } from '@vet-clinic/types';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, formValues } from '@/components/common';
import { useClinic } from '@/components/context';
export function PetForm({ pet }: { pet?: Pet }) {
  const translate = useTranslations('clinic');
  const { busy, run } = useClinic();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = formValues(e.currentTarget);
        const body = {
          name: v.name,
          species: v.species,
          sex: v.sex,
          ...(v.dateOfBirth ? { dateOfBirth: v.dateOfBirth } : {}),
          ...(v.approximateAge ? { approximateAge: v.approximateAge } : {}),
          ...(v.breed ? { breed: v.breed } : {}),
          ...(v.weight ? { weight: Number(v.weight) } : {}),
          ...(v.notes ? { notes: v.notes } : {}),
        };
        void run(
          () => api(pet ? `pets/${pet.id}` : 'pets', body, pet ? 'PATCH' : 'POST'),
          pet ? translate('petProfileUpdated') : translate('welcomeToTheFamily'),
        );
      }}
    >
      <Field label={translate('petName')}>
        <input
          name="name"
          defaultValue={pet?.name}
          placeholder={translate('luna')}
          required
          maxLength={100}
        />
      </Field>
      <div className="form-grid">
        <Field label={translate('species')}>
          <select name="species" defaultValue={pet?.species || 'Dog'}>
            {['Dog', 'Cat', 'Rabbit', 'Bird', 'Other'].map((s) => (
              <option key={s} value={s}>
                {translate(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={translate('sex')}>
          <select name="sex" defaultValue={pet?.sex || 'Female'}>
            <option value="Female">{translate('female')}</option>
            <option value="Male">{translate('male')}</option>
          </select>
        </Field>
      </div>
      <div className="form-grid">
        <Field label={translate('dateOfBirth')}>
          <input
            name="dateOfBirth"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            defaultValue={pet?.dateOfBirth}
          />
        </Field>
        <Field
          label={translate('approximateAge')}
          hint={translate('requiredIfDateOfBirthIsUnknown')}
        >
          <input
            name="approximateAge"
            defaultValue={pet?.approximateAge}
            placeholder={translate('about3Years')}
            maxLength={100}
          />
        </Field>
      </div>
      <div className="form-grid">
        <Field label={translate('breedOptional')}>
          <input name="breed" defaultValue={pet?.breed} />
        </Field>
        <Field label={translate('weightInKgOptional')}>
          <input
            name="weight"
            type="number"
            step="any"
            min="0.001"
            max="2000"
            defaultValue={pet?.weight}
          />
        </Field>
      </div>
      <Field label={translate('anythingWeShouldKnowOptional')}>
        <textarea
          name="notes"
          defaultValue={pet?.notes}
          placeholder={translate('allergiesTemperamentOrOtherHelpfulNotes')}
          maxLength={2000}
        />
      </Field>
      <Button type="submit" disabled={busy}>
        {busy ? translate('saving') : translate('savePetProfile')}
      </Button>
    </form>
  );
}
