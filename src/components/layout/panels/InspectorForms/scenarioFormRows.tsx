import { useId } from 'react';

/**
 * Scenario inspector 共享表单原语（受控输入、行布局），供 obstacle/ego/light
 * 等表单复用。样式与字段密度保持一致 —— 字段少、无校验，受控输入比 RHF 更直接。
 */

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-white/[0.07] px-3 py-2">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {title}
      </div>
      {children}
    </div>
  );
}

export function Row({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <label htmlFor={htmlFor} className="w-20 shrink-0 text-[11px] text-zinc-500">
        {label}
      </label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export const inputCls =
  'w-full rounded border border-white/10 bg-zinc-800/50 px-2 py-1 text-xs text-zinc-200 focus:border-cyan-500/50 focus:outline-none';

export function NumRow({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <Row label={label} htmlFor={id}>
      <input
        id={id}
        type="number"
        aria-label={label}
        step={step ?? 0.1}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className={inputCls}
      />
    </Row>
  );
}

export function TextRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <Row label={label} htmlFor={id}>
      <input
        id={id}
        type="text"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </Row>
  );
}

export function SelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <Row label={label} htmlFor={id}>
      <select
        id={id}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </Row>
  );
}

export function ReadRow({ label, value }: { label: string; value: string | number }) {
  return (
    <Row label={label}>
      <span className="text-[11px] text-zinc-400">{value}</span>
    </Row>
  );
}
