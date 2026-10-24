'use client';
// 展示组件：滑条（本地值+松手提交）/ 分段 / 开关 / 行 / 卡片 / 弹窗 / Toast
import React, { useEffect, useState } from 'react';
import { Icon } from './icons';

export function Pill({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return <span className={'pill' + (tone ? ' pill-' + tone : '')}>{children}</span>;
}

export function Slider({ label, tag, value, min = 0, max = 100, step = 1, onChange, format, disabled, trailing }:
  { label: string; tag?: string; value: number; min?: number; max?: number; step?: number;
    onChange: (v: number) => void; format?: (v: number) => string; disabled?: boolean; trailing?: React.ReactNode }) {
  const fmt = format ?? ((v: number) => v + '%');
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const commit = () => { if (!disabled && local !== value) onChange(local); };
  return (
    <div className={'row' + (disabled ? ' row-off' : '')}>
      <div className="rowlabel">
        <span>{label}</span>
        {tag ? <Pill>{tag}</Pill> : null}
      </div>
      <input className="rng" type="range" min={min} max={max} step={step} value={local}
        disabled={disabled} aria-label={label}
        onChange={(e) => setLocal(parseInt(e.target.value, 10))}
        onPointerUp={commit} onBlur={commit}
        onKeyUp={(e) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) commit(); }} />
      <span className="rowval">
        <input className="numinp" type="number" min={min} max={max} step={step} value={local} disabled={disabled}
          aria-label={label + '数值'}
          onChange={(e) => setLocal(parseInt(e.target.value, 10) || 0)}
          onBlur={() => { const c = Math.max(min, Math.min(max, Math.round(local))); setLocal(c); if (!disabled && c !== value) onChange(c); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      </span>
      {trailing ?? null}
    </div>
  );
}

export function Seg({ options, value, onChange, disabled }:
  { options: string[]; value: string; onChange?: (o: string) => void; disabled?: boolean }) {
  return (
    <div className={'seg' + (disabled ? ' seg-off' : '')} role="group">
      {options.map((o) => (
        <button key={o} type="button" className={o === value ? 'on' : ''} disabled={disabled}
          onClick={() => onChange && onChange(o)}>{o}</button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, disabled, label }:
  { checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label}
      className={'tgl' + (checked ? ' on' : '') + (disabled ? ' tgl-off' : '')}
      disabled={disabled} onClick={() => onChange && onChange(!checked)}>
      <span className="tglknob" />
    </button>
  );
}

export function Row({ label, hint, tag, children }:
  { label: React.ReactNode; hint?: React.ReactNode; tag?: string; children?: React.ReactNode }) {
  return (
    <div className="row">
      <div className="rowlabel">
        <span>{label}</span>
        {tag ? <Pill>{tag}</Pill> : null}
        {hint ? <span className="rowhint">{hint}</span> : null}
      </div>
      <div className="rowctrl">{children}</div>
    </div>
  );
}

export function Card({ title, extra, children }: { title?: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card">
      {(title || extra) && (
        <header className="cardhead">
          <h3>{title}</h3>
          <span className="grow" />
          {extra}
        </header>
      )}
      {children}
    </section>
  );
}

export interface ConfirmDlg { text: string; danger?: boolean; onOk: () => void }

export function Modal({ dlg, onCancel }: { dlg: ConfirmDlg | null; onCancel: () => void }) {
  if (!dlg) return null;
  return (
    <div className="mask" onClick={onCancel}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-label="确认操作" onClick={(e) => e.stopPropagation()}>
        <p className="modaltext">{dlg.text}</p>
        <div className="modalrow">
          <button type="button" className="mini" onClick={onCancel}>取消</button>
          <button type="button" className={'mini ' + (dlg.danger === false ? 'mini-primary' : 'mini-danger')}
            onClick={() => { dlg.onOk(); onCancel(); }}>确认执行</button>
        </div>
      </div>
    </div>
  );
}

export interface ToastItem { id: number; key: string; msg: string }

export function Toasts({ items }: { items: ToastItem[] }) {
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => <div key={t.id} className="toast"><Icon name="check" size={13} />{t.msg}</div>)}
    </div>
  );
}
