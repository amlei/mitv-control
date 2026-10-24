// panes.jsx — 无状态展示组件：滑条 / 分段 / 开关 / 行 / 卡片 / 弹窗 / 徽标
const { useState, useEffect } = React;

function Pill({ children, tone }) {
  return <span className={'pill' + (tone ? ' pill-' + tone : '')}>{children}</span>;
}

// 滑条：拖动中只更新本地值，松手/抬键才提交一次（防 apply+toast 风暴）
function Slider({ label, tag, value, min = 0, max = 100, step = 1, onChange, format, disabled, trailing }) {
  const fmt = format || ((v) => v + '%');
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
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }} />
      </span>
      {trailing || null}
    </div>
  );
}

function Seg({ options, value, onChange, disabled }) {
  return (
    <div className={'seg' + (disabled ? ' seg-off' : '')} role="group">
      {options.map((o) => (
        <button key={o} type="button" className={o === value ? 'on' : ''} disabled={disabled}
          onClick={() => onChange && onChange(o)}>{o}</button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label}
      className={'tgl' + (checked ? ' on' : '') + (disabled ? ' tgl-off' : '')}
      disabled={disabled} onClick={() => onChange && onChange(!checked)}>
      <span className="tglknob" />
    </button>
  );
}

function Row({ label, hint, tag, children, stack }) {
  return (
    <div className={'row' + (stack ? ' row-stack' : '')}>
      <div className="rowlabel">
        <span>{label}</span>
        {tag ? <Pill>{tag}</Pill> : null}
        {hint ? <span className="rowhint">{hint}</span> : null}
      </div>
      <div className="rowctrl">{children}</div>
    </div>
  );
}

function Card({ title, extra, children }) {
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

// 危险操作确认弹窗（居中 + 遮罩），文案遵循 repo-conventions 模板
function Modal({ dlg, onCancel }) {
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

function Toasts({ items }) {
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast"><Icon name="check" size={13} />{t.msg}</div>
      ))}
    </div>
  );
}

function EmptyState({ icon, title, hint }) {
  return (
    <div className="empty">
      <Icon name={icon} size={30} />
      <p className="emptytitle">{title}</p>
      <p className="emptyhint">{hint}</p>
    </div>
  );
}

Object.assign(window, { Pill, Slider, Seg, Toggle, Row, Card, Modal, Toasts, EmptyState });
