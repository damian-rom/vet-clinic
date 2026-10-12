'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
  busy?: boolean;
  onClose: () => void;
}

function focusableControls(dialog: HTMLDialogElement) {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]',
    ),
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(':disabled') &&
      element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility !== 'hidden',
  );
}

export function Modal({ open, title, description, children, busy = false, onClose }: ModalProps) {
  const translate = useTranslations('clinic');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;

    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const body = document.body;
    const overflow = body.style.overflow;
    const marginRight = body.style.marginRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    body.style.marginRight = `${parseFloat(getComputedStyle(body).marginRight) + scrollbarWidth}px`;
    body.style.overflow = 'hidden';
    dialog.showModal();

    return () => {
      dialog.close();
      body.style.overflow = overflow;
      body.style.marginRight = marginRight;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  // A visit detail can be replaced by a form without closing its modal.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (
      !dialog?.open ||
      (dialog.contains(document.activeElement) && document.activeElement !== dialog)
    )
      return;
    focusableControls(dialog)[0]?.focus({ preventScroll: true });
  }, [children, title]);

  if (!open || typeof document === 'undefined') return null;

  const close = () => {
    if (!busy) onClose();
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      className="dialog-content"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onKeyDown={(event) => {
        if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return;
        const controls = focusableControls(event.currentTarget);
        const first = controls[0];
        const last = controls.at(-1);
        if (!first || !last) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          close();
      }}
    >
      <h2 id={titleId} className="modal-title">
        {title}
      </h2>
      <p id={descriptionId} className="muted modal-description">
        {description}
      </p>
      {children}
      <button
        type="button"
        className="dialog-close"
        aria-label={translate('closeDialog')}
        onClick={close}
      >
        <X size={20} />
      </button>
    </dialog>,
    document.body,
  );
}
