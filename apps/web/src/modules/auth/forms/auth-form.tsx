'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PawPrint, CalendarDays, Heart, ShieldCheck, ArrowRight, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, formValues } from '@/components/common';
import { LanguageSwitch } from '@/i18n/locale-provider';

export function AuthForm({ onLogin }: { onLogin: () => Promise<void> }) {
  const translate = useTranslations('clinic');
  const [mode, setMode] = useState<'login' | 'owner' | 'vet'>('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <main className="auth-page">
      <section className="auth-story">
        <a className="brand" href="/">
          <span>
            <PawPrint size={25} />
          </span>
          {translate('pawstead')}
          <span className="brand-dot">.</span>
        </a>
        <div className="auth-intro">
          <p className="eyebrow">{translate('careConnected')}</p>
          <h1>
            {translate('aLittleLessAdmin')}
            <br />
            {translate('aLotMoreCare')}
          </h1>
          <p>{translate('fromTheFirstAppointmentToTheLastFollowUpACalmerHome')}</p>
          <div className="auth-features">
            <div>
              <CalendarDays />
              <span>{translate('appointmentsThatFitYourLife')}</span>
            </div>
            <div>
              <Heart />
              <span>{translate('everyStepOfCareTogether')}</span>
            </div>
            <div>
              <ShieldCheck />
              <span>{translate('yourPetSHistoryInSafeHands')}</span>
            </div>
          </div>
        </div>
        <p className="auth-foot">{translate('thoughtfulCareClearNextSteps')}</p>
        <div className="auth-art" aria-hidden="true">
          <PawPrint size={170} strokeWidth={1} />
        </div>
      </section>
      <section className="auth-form-side">
        <div className="auth-language">
          <LanguageSwitch />
        </div>
        <div className="auth-card">
          <span className="section-icon">
            <PawPrint />
          </span>
          <h2>
            {mode === 'login'
              ? translate('welcomeBack')
              : mode === 'vet'
                ? translate('joinTheClinic')
                : translate('letSMeetYourFamily')}
          </h2>
          <p className="muted">
            {mode === 'login'
              ? translate('signInToKeepCareMoving')
              : mode === 'vet'
                ? translate('yourOwnAccountASharedMission')
                : translate('createAnAccountToRegisterPetsAndBookVisits')}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              const values = formValues(e.currentTarget);
              try {
                await api(
                  `auth/${mode === 'login' ? 'login' : mode === 'vet' ? 'register-vet' : 'register'}`,
                  values,
                );
                await onLogin();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Unable to sign in');
              } finally {
                setBusy(false);
              }
            }}
          >
            {mode !== 'login' && (
              <Field label={translate('fullName')}>
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={100}
                  placeholder={translate('alexMorgan')}
                />
              </Field>
            )}
            <Field label={translate('emailAddress')}>
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder={translate('youExampleCom')}
              />
            </Field>
            <Field
              label={translate('password')}
              hint={mode !== 'login' ? translate('atLeast10Characters') : undefined}
            >
              <input
                name="password"
                type="password"
                required
                minLength={mode === 'login' ? 1 : 10}
                maxLength={128}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </Field>
            {mode === 'vet' && (
              <Field label={translate('clinicAccessCode')}>
                <input name="clinicCode" type="password" required autoComplete="off" />
              </Field>
            )}
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <Button disabled={busy} className="full" type="submit">
              {busy
                ? translate('pleaseWait')
                : mode === 'login'
                  ? translate('signIn')
                  : translate('createAccount')}
              <ArrowRight size={17} />
            </Button>
          </form>
          <div className="auth-links">
            {mode === 'login' ? (
              <>
                <p>
                  {translate('newHere')}{' '}
                  <button
                    onClick={() => {
                      setMode('owner');
                      setError('');
                    }}
                  >
                    {translate('createAnOwnerAccount')}
                  </button>
                </p>
                <button
                  className="staff-link"
                  onClick={() => {
                    setMode('vet');
                    setError('');
                  }}
                >
                  <Users size={15} />
                  {translate('veterinarianRegistration')}
                </button>
              </>
            ) : (
              <p>
                {translate('alreadyHaveAnAccount')}{' '}
                <button
                  onClick={() => {
                    setMode('login');
                    setError('');
                  }}
                >
                  {translate('signIn')}
                </button>
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
