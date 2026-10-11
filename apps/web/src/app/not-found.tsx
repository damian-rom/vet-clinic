'use client';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
export default function NotFound() {
  const translate = useTranslations('clinic');
  return (
    <main className="loading">
      <h1>{translate('thatPageCouldnTBeFound')}</h1>
      <p>{translate('theClinicWorkspaceIsOneClickAway')}</p>
      <Link className="button button-primary" href="/">
        {translate('returnToTheClinic')}
      </Link>
    </main>
  );
}
