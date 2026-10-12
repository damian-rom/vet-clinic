'use client';

import { useId, useState, type ComponentProps } from 'react';
import { useTranslations } from 'next-intl';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from './button';

export function PasswordInput({ id, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  const translate = useTranslations('clinic');
  const generatedId = useId();
  const inputId = id || generatedId;
  const [visible, setVisible] = useState(false);
  const action = translate(visible ? 'hidePassword' : 'showPassword');

  return (
    <div className="password-control">
      <input {...props} id={inputId} type={visible ? 'text' : 'password'} />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="password-toggle"
        aria-label={action}
        aria-pressed={visible}
        aria-controls={inputId}
        title={action}
        disabled={props.disabled}
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </Button>
    </div>
  );
}
