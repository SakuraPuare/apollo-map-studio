import { useFormContext, Controller } from 'react-hook-form';
import { clsx } from 'clsx';

// ─── Form Field Wrapper ────────────────────────────────────

interface FieldProps {
  name: string;
  label: string;
  children: React.ReactNode;
}

export function Field({ name, label, children }: FieldProps) {
  const { formState: { errors } } = useFormContext();
  const error = errors[name]?.message as string | undefined;

  return (
    <div className="flex items-center gap-2 py-1">
      <label className="text-[11px] text-zinc-500 w-24 shrink-0">{label}</label>
      <div className="flex-1 min-w-0">
        {children}
        {error && (
          <p className="text-[10px] text-red-400 mt-0.5">{error}</p>
        )}
      </div>
    </div>
  );
}

// ─── Text Input ────────────────────────────────────────────

interface InputProps {
  name: string;
  label: string;
  type?: 'text' | 'number';
  min?: number;
  max?: number;
  step?: number;
}

export function Input({ name, label, type = 'text', min, max, step }: InputProps) {
  const { register } = useFormContext();

  return (
    <Field name={name} label={label}>
      <input
        type={type}
        min={min}
        max={max}
        step={step}
        {...register(name, { valueAsNumber: type === 'number' })}
        className={clsx(
          'w-full px-2 py-1 rounded text-xs',
          'bg-zinc-800/50 border border-white/10',
          'text-zinc-200 placeholder-zinc-600',
          'focus:border-cyan-500/50 focus:outline-none',
          'transition-colors'
        )}
      />
    </Field>
  );
}

// ─── Select Input ──────────────────────────────────────────

interface SelectProps {
  name: string;
  label: string;
  options: readonly string[];
}

export function Select({ name, label, options }: SelectProps) {
  const { control } = useFormContext();

  return (
    <Field name={name} label={label}>
      <Controller
        name={name}
        control={control}
        render={({ field }) => (
          <select
            {...field}
            className={clsx(
              'w-full px-2 py-1 rounded text-xs cursor-pointer',
              'bg-zinc-800/50 border border-white/10',
              'text-zinc-200',
              'focus:border-cyan-500/50 focus:outline-none',
              'transition-colors'
            )}
          >
            {options.map((opt) => (
              <option key={opt} value={opt} className="bg-zinc-900">
                {opt}
              </option>
            ))}
          </select>
        )}
      />
    </Field>
  );
}

// ─── Section ───────────────────────────────────────────────

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

export function Section({ title, children }: SectionProps) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-[2px] h-3 rounded-full bg-cyan-500/50" />
        <h3 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
          {title}
        </h3>
      </div>
      <div className="pl-2 border-l border-white/5">{children}</div>
    </div>
  );
}

// ─── Read-only Value ───────────────────────────────────────

interface ValueProps {
  label: string;
  value: React.ReactNode;
}

export function Value({ label, value }: ValueProps) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-[11px] text-zinc-500 w-24 shrink-0">{label}</span>
      <span className="text-[11px] font-mono text-zinc-400">{value}</span>
    </div>
  );
}
