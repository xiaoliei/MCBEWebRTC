import type { InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helperText?: string;
}

export function Input({
  id,
  label,
  helperText,
  className,
  ...props
}: InputProps) {
  const classes = ['pixel-input', className ?? ''].filter(Boolean).join(' ');

  return (
    <label className="pixel-field" htmlFor={id}>
      <span className="pixel-field__label">{label}</span>
      <input className={classes} id={id} {...props} />
      {helperText ? <span className="pixel-field__helper">{helperText}</span> : null}
    </label>
  );
}
