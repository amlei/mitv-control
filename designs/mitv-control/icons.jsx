// icons.jsx — 24px stroke 图标集（手绘极简，风格统一）
const ICON_PATHS = {
  gauge: <g><path d="M12 15l3.5-3.5" /><path d="M20.2 15.9A8.5 8.5 0 1 0 3.8 16" /><circle cx="12" cy="15" r="1" /></g>,
  monitor: <g><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" x2="16" y1="21" y2="21" /><line x1="12" x2="12" y1="17" y2="21" /></g>,
  gamepad: <g><line x1="6" x2="10" y1="12" y2="12" /><line x1="8" x2="8" y1="10" y2="14" /><line x1="15" x2="15.01" y1="13" y2="13" /><line x1="18" x2="18.01" y1="11" y2="11" /><rect x="2" y="6" width="20" height="12" rx="3" /></g>,
  sliders: <g><line x1="21" x2="14" y1="4" y2="4" /><line x1="10" x2="3" y1="4" y2="4" /><line x1="21" x2="12" y1="12" y2="12" /><line x1="8" x2="3" y1="12" y2="12" /><line x1="21" x2="16" y1="20" y2="20" /><line x1="12" x2="3" y1="20" y2="20" /><line x1="14" x2="14" y1="2" y2="6" /><line x1="8" x2="8" y1="10" y2="14" /><line x1="16" x2="16" y1="18" y2="22" /></g>,
  crosshair: <g><circle cx="12" cy="12" r="9" /><line x1="21" x2="17" y1="12" y2="12" /><line x1="7" x2="3" y1="12" y2="12" /><line x1="12" x2="12" y1="7" y2="3" /><line x1="12" x2="12" y1="21" y2="17" /></g>,
  lamp: <g><path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 2a7 7 0 0 0-4.1 12.7c.7.5 1.1 1.4 1.1 2.3h6c0-.9.4-1.8 1.1-2.3A7 7 0 0 0 12 2z" /></g>,
  bookmark: <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />,
  sparkles: <g><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" /><path d="M19 15v4" /><path d="M17 17h4" /></g>,
  settings: <g><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3" /><path d="M12 18.5v3" /><path d="M2.5 12h3" /><path d="M18.5 12h3" /><path d="M5.3 5.3l2.1 2.1" /><path d="M16.6 16.6l2.1 2.1" /><path d="M5.3 18.7l2.1-2.1" /><path d="M16.6 7.4l2.1-2.1" /></g>,
  sun: <g><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="M4.9 4.9l1.4 1.4" /><path d="M17.7 17.7l1.4 1.4" /><path d="M4.9 19.1l1.4-1.4" /><path d="M17.7 6.3l1.4-1.4" /></g>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  power: <g><path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.8 0" /></g>,
  volume: <g><path d="M11 5L6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a10 10 0 0 1 0 14" /></g>,
  volumeX: <g><path d="M11 5L6 9H2v6h4l5 4z" /><line x1="22" x2="16" y1="9" y2="15" /><line x1="16" x2="22" y1="9" y2="15" /></g>,
  chevronUp: <polyline points="18 15 12 9 6 15" />,
  chevronDown: <polyline points="6 9 12 15 18 9" />,
  chevronLeft: <polyline points="15 18 9 12 15 6" />,
  chevronRight: <polyline points="9 18 15 12 9 6" />,
  home: <g><path d="M3 11l9-8 9 8" /><path d="M5 9.9V21h14V9.9" /></g>,
  back: <g><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></g>,
  menu: <g><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="18" y2="18" /></g>,
  plus: <g><path d="M12 5v14" /><path d="M5 12h14" /></g>,
  minus: <path d="M5 12h14" />,
  refresh: <g><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" /><path d="M21 3v5h-5" /></g>,
  copy: <g><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></g>,
  check: <polyline points="20 6 9 17 4 12" />,
  send: <g><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></g>,
  x: <g><path d="M18 6L6 18" /><path d="M6 6l12 12" /></g>,
  key: <g><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01" /><path d="M10 10h.01" /><path d="M14 10h.01" /><path d="M18 10h.01" /><path d="M7 14h10" /></g>,
  phone: <g><rect x="7" y="2" width="10" height="20" rx="2.5" /><path d="M11 18.5h2" /></g>,
  zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
};

function Icon({ name, size = 16, className }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name] || null}
    </svg>
  );
}

Object.assign(window, { Icon });
