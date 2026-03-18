import type { ReactNode } from 'react';

interface RadioOption<T extends string> {
  value: T;
  label: ReactNode;
}

export interface RadioGroupProps<T extends string> {
  legend: string;
  name: string;
  options: RadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function RadioGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange
}: RadioGroupProps<T>) {
  return (
    <fieldset className="pixel-radio-group">
      <legend className="pixel-radio-group__legend">{legend}</legend>
      <div className="pixel-radio-group__options">
        {options.map((option) => {
          const optionId = `${name}-${option.value}`;
          return (
            <label className="pixel-radio" htmlFor={optionId} key={option.value}>
              <input
                checked={value === option.value}
                id={optionId}
                name={name}
                onChange={() => onChange(option.value)}
                type="radio"
                value={option.value}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
