'use client';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  CalendarDays,
  ClipboardList,
  Heart,
  LayoutDashboard,
  LogOut,
  Package,
  PawPrint,
  Settings,
  CircleCheck,
  RefreshCw,
  FileText,
} from 'lucide-react';
import type { OwnerWorkspace, VetWorkspace } from '@vet-clinic/types';
import { api, ApiError } from '@/lib/api';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Context } from './context';
import { OwnerHome } from '@/modules/overview/owner-overview';
import { Pets } from '@/modules/pets/list/pet-list';
import { OwnerAppointments } from '@/modules/appointments/list/owner-appointments';
import { VetHome } from '@/modules/overview/vet-overview';
import { AppointmentList } from '@/modules/appointments/list/appointment-list';
import { Cases } from '@/modules/cases/list/case-list';
import { Inventory } from '@/modules/inventory/list/inventory';
import { Configuration } from '@/modules/configuration/configuration';
import { Calendar } from '@/modules/calendar/calendar';
import { Reports } from '@/modules/reports/reports';
import { LanguageSwitch } from '@/i18n/locale-provider';
import { AuthForm } from '@/modules/auth/forms/auth-form';
export function ClinicApp() {
  const translate = useTranslations('clinic');
  const [data, setData] = useState<OwnerWorkspace | VetWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const [modal, setModal] = useState<{
    title: string;
    description: string;
    content: ReactNode;
  } | null>(null);
  const refresh = useCallback(async () => {
    const result = await api<OwnerWorkspace | VetWorkspace>('workspace');
    setData(result);
    setLoadError('');
  }, []);
  const initialize = useCallback(async () => {
    setLoading(true);
    try {
      await refresh();
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401))
        setLoadError(e instanceof Error ? e.message : 'Unable to reach the clinic');
    } finally {
      setLoading(false);
    }
  }, [refresh]);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  useEffect(() => {
    const changed = () => setTab(window.location.hash.slice(1) || 'overview');
    changed();
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  useEffect(() => {
    if (!data) return;
    const t = setInterval(() => {
      if (!busy && !modal) void refresh().catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, [data, busy, modal, refresh]);
  const run = async (task: () => Promise<unknown>, message: string, close = true) => {
    setBusy(true);
    setNotice(null);
    try {
      await task();
      await refresh();
      setNotice({ text: message, error: false });
      if (close) setModal(null);
      return true;
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : 'Unable to save', error: true });
      if (error instanceof ApiError && error.status === 401) {
        setData(null);
        setModal(null);
      } else await refresh().catch(() => {});
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (loading)
    return (
      <main className="loading">
        <PawPrint size={35} />
        <p>{translate('openingTheClinic')}</p>
      </main>
    );
  if (loadError && !data)
    return (
      <main className="loading">
        <h1>{translate('unableToReachTheClinic')}</h1>
        <p role="alert">{loadError}</p>
        <Button onClick={() => void initialize()}>{translate('tryAgain')}</Button>
      </main>
    );
  if (!data) return <AuthForm onLogin={refresh} />;
  const vet = data.user.role === 'vet';
  const navigation = vet
    ? [
        { id: 'overview', label: translate('overview'), icon: LayoutDashboard },
        { id: 'appointments', label: translate('appointments'), icon: ClipboardList },
        { id: 'calendar', label: translate('calendar'), icon: CalendarDays },
        { id: 'cases', label: translate('careCases'), icon: Heart },
        { id: 'inventory', label: translate('inventory'), icon: Package },
        { id: 'configuration', label: translate('configuration'), icon: Settings },
        { id: 'reports', label: translate('reports'), icon: FileText },
      ]
    : [
        { id: 'overview', label: translate('overview'), icon: LayoutDashboard },
        { id: 'pets', label: translate('myPets'), icon: PawPrint },
        { id: 'appointments', label: translate('appointments'), icon: CalendarDays },
        { id: 'cases', label: translate('careCases'), icon: Heart },
        { id: 'reports', label: translate('reports'), icon: FileText },
      ];
  const current = navigation.find((n) => n.id === tab)?.id || 'overview';
  const content =
    current === 'reports' ? (
      <Reports />
    ) : current === 'pets' ? (
      <Pets />
    ) : current === 'appointments' ? (
      vet ? (
        <AppointmentList />
      ) : (
        <OwnerAppointments />
      )
    ) : current === 'calendar' && vet ? (
      <Calendar />
    ) : current === 'cases' ? (
      <Cases />
    ) : current === 'inventory' && vet ? (
      <Inventory />
    ) : current === 'configuration' && vet ? (
      <Configuration />
    ) : vet ? (
      <VetHome />
    ) : (
      <OwnerHome />
    );
  return (
    <Context.Provider
      value={{
        data,
        busy,
        open: (title, description, content) => {
          setNotice(null);
          setModal({ title, description, content });
        },
        close: () => setModal(null),
        run,
      }}
    >
      <div className="app-shell">
        <aside className="sidebar">
          <a href="#overview" className="brand">
            <span>
              <PawPrint size={22} />
            </span>
            {translate('pawstead')}
            <span className="brand-dot">.</span>
          </a>
          <p className="sidebar-caption">
            {vet ? translate('clinicWorkspace') : translate('yourPetSCare')}
          </p>
          <nav aria-label={translate('mainNavigation')}>
            {navigation.map((n) => (
              <a
                key={n.id}
                href={`#${n.id}`}
                className={current === n.id ? 'active' : ''}
                aria-current={current === n.id ? 'page' : undefined}
              >
                <n.icon size={19} />
                {n.label}
              </a>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="clinic-note">
              <Heart size={20} />
              <strong>{translate('careComesFirst')}</strong>
              <p>{translate('aClearPlanForEveryVisit')}</p>
            </div>
            <div className="profile">
              <span className="avatar">{data.user.name.slice(0, 1).toUpperCase()}</span>
              <div>
                <strong>{data.user.name}</strong>
                <small>{vet ? translate('veterinarian') : translate('petOwner')}</small>
              </div>
              <button
                aria-label={translate('signOut')}
                title={translate('signOut')}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api('auth/logout', {});
                    setData(null);
                    setModal(null);
                    setNotice(null);
                    window.location.hash = '';
                  } catch (e) {
                    setNotice({
                      text: e instanceof Error ? e.message : 'Unable to sign out',
                      error: true,
                    });
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </aside>
        <div className="main-column">
          <header className="topbar">
            <span>
              <span className="live-dot" />
              {translate('pawsteadVeterinaryClinic')}
            </span>
            <div>
              <span className="timezone">{data.clinic.timezone}</span>
              <LanguageSwitch />
              <Button
                size="icon"
                variant="ghost"
                aria-label={translate('refreshWorkspace')}
                disabled={busy}
                onClick={() => void run(refresh, translate('workspaceRefreshed'), false)}
              >
                <RefreshCw size={16} />
              </Button>
              <span className="role-label">
                {vet ? translate('vetWorkspace') : translate('ownerPortal')}
              </span>
            </div>
          </header>
          <main className="workspace">
            {notice && !modal && (
              <div
                className={`notice ${notice.error ? 'error' : 'success'}`}
                role={notice.error ? 'alert' : 'status'}
              >
                {!notice.error && <CircleCheck size={17} />}
                <span>{notice.text}</span>
                <button
                  aria-label={translate('dismissNotification')}
                  onClick={() => setNotice(null)}
                >
                  ×
                </button>
              </div>
            )}
            {content}
          </main>
          <footer className="app-footer">
            {translate('pawsteadACalmerKindOfCare')}
            <span>{translate('monFri09001800')}</span>
          </footer>
        </div>
      </div>
      <Dialog
        open={Boolean(modal)}
        onOpenChange={(value) => {
          if (!value && !busy) setModal(null);
        }}
      >
        <DialogContent>
          <DialogTitle className="modal-title">{modal?.title}</DialogTitle>
          <DialogDescription className="muted modal-description">
            {modal?.description}
          </DialogDescription>
          {notice && modal && (
            <p className={`notice ${notice.error ? 'error' : 'success'}`} role="alert">
              {notice.text}
            </p>
          )}
          {modal?.content}
        </DialogContent>
      </Dialog>
    </Context.Provider>
  );
}
