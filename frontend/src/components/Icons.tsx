interface IconProps {
  style?: React.CSSProperties;
  className?: string;
  onClick?: () => void;
}

export const DashboardIcon = ({ style, className }: IconProps) => (
  <svg style={{ width: 16, height: 16, ...style }} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="9" />
    <rect x="14" y="3" width="7" height="5" />
    <rect x="14" y="12" width="7" height="9" />
    <rect x="3" y="16" width="7" height="5" />
  </svg>
);

export const TransactionIcon = ({ style, className }: IconProps) => (
  <svg style={{ width: 16, height: 16, ...style }} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

export const WalletIcon = ({ style, className, onClick }: IconProps) => (
  <svg style={{ width: 16, height: 16, ...style }} className={className} onClick={onClick} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
    <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
  </svg>
);

export const CreditIcon = ({ style, className, onClick }: IconProps) => (
  <svg style={{ width: 16, height: 16, ...style }} className={className} onClick={onClick} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
  </svg>
);

export const TargetIcon = ({ style, className, onClick }: IconProps) => (
  <svg style={{ width: 16, height: 16, ...style }} className={className} onClick={onClick} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

export const MenuFoldIcon = ({ style, className, onClick }: IconProps) => (
  <svg style={{ width: 18, height: 18, ...style }} className={className} onClick={onClick} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="21" y1="6" x2="3" y2="6" />
    <line x1="21" y1="12" x2="11" y2="12" />
    <line x1="21" y1="18" x2="3" y2="18" />
    <polyline points="7 9 4 12 7 15" />
  </svg>
);

export const MenuUnfoldIcon = ({ style, className, onClick }: IconProps) => (
  <svg style={{ width: 18, height: 18, ...style }} className={className} onClick={onClick} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="13" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
    <polyline points="17 9 20 12 17 15" />
  </svg>
);

export const ArrowUpIcon = ({ style, className }: IconProps) => (
  <svg style={{ width: 14, height: 14, ...style }} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </svg>
);

export const ArrowDownIcon = ({ style, className }: IconProps) => (
  <svg style={{ width: 14, height: 14, ...style }} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <polyline points="19 12 12 19 5 12" />
  </svg>
);

export const PlusIcon = ({ style, className }: IconProps) => (
  <svg style={{ width: 16, height: 16, ...style }} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const TrashIcon = ({ style, className }: IconProps) => (
  <svg style={{ width: 16, height: 16, ...style }} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

export const MoneyIcon = ({ style, className }: IconProps) => (
  <svg style={{ width: 32, height: 32, ...style }} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v12" />
    <path d="M8 10h8" />
    <path d="M8 14h8" />
    <circle cx="12" cy="12" r="4" />
  </svg>
);

export const ScheduleIcon = ({ style, className }: IconProps) => (
  <svg style={{ width: 16, height: 16, ...style }} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="8" y1="14" x2="8" y2="14.01" />
    <line x1="12" y1="14" x2="12" y2="14.01" />
    <line x1="16" y1="14" x2="16" y2="14.01" />
  </svg>
);
