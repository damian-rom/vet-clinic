import type { Metadata } from 'next';
import './globals.css';
import { LocaleProvider } from '@/i18n/locale-provider';

export const metadata: Metadata = {
  title: 'Pawstead | Vet Clinic',
  description: 'Veterinary clinic platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
