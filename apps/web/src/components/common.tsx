'use client';
import { cloneElement, useId, type ReactElement, type ReactNode } from 'react';
import type { AppointmentStatus } from '@vet-clinic/types';
import { PawPrint } from 'lucide-react';
import { useTranslations } from 'next-intl';
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactElement<{ id?: string; 'aria-describedby'?: string }>;
  hint?: string;
}) {
  const generatedId = useId();
  const controlId = children.props.id || generatedId;
  const hintId = `${controlId}-hint`;
  const description =
    [children.props['aria-describedby'], hint ? hintId : undefined].filter(Boolean).join(' ') ||
    undefined;
  return (
    <div className="field">
      <label htmlFor={controlId}>{label}</label>
      {cloneElement(children, { id: controlId, 'aria-describedby': description })}
      {hint && <small id={hintId}>{hint}</small>}
    </div>
  );
}
const labels: Record<AppointmentStatus, string> = {
  AwaitingConfirmation: 'awaitingConfirmation',
  Confirmed: 'confirmed',
  NeedsTime: 'needsTime',
  Done: 'done',
  Cancelled: 'cancelled',
};
export function Status({ status }: { status: AppointmentStatus }) {
  const translate = useTranslations('clinic');
  return (
    <span className={`status status-${status}`}>
      <i />
      {translate(labels[status])}
    </span>
  );
}
export function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <PawPrint size={25} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  text,
  actions,
}: {
  eyebrow: string;
  title: string;
  text: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{text}</p>
      </div>
      <div className="heading-actions">{actions}</div>
    </div>
  );
}
export function formValues(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
}
