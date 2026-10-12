import type { ComponentProps } from 'react';

interface ButtonAppearance {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'icon';
}

const colors = {
  default: 'button-primary',
  outline: 'button-outline',
  ghost: 'button-ghost',
  destructive: 'button-danger',
};

const sizes = { default: '', sm: 'button-sm', icon: 'button-icon' };

function buttonClassName(
  { variant = 'default', size = 'default' }: ButtonAppearance,
  className?: string,
) {
  return ['button', colors[variant], sizes[size], className].filter(Boolean).join(' ');
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<'button'> & ButtonAppearance) {
  return <button className={buttonClassName({ variant, size }, className)} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<'a'> & ButtonAppearance) {
  return <a className={buttonClassName({ variant, size }, className)} {...props} />;
}
