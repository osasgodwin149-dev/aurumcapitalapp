import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, X, ChevronDown, ChevronUp, Bell, BellOff } from 'lucide-react';
import { playClaimNoticeSound } from '../utils/lagosAudio';

export interface ClaimActivityEntry {
  maskedName: string;
  amount: string;
  refCode: string;
}

// 25 filler activity entries with masked names (strictly NO real names, NO locations) and 1 Trillion Naira amount
export const REALISTIC_CLAIMS: ClaimActivityEntry[] = [
  { maskedName: 'A*****', amount: '₦1,000,000,000,000', refCode: 'LAG-98421' },
  { maskedName: '******', amount: '₦1,000,000,000,000', refCode: 'LAG-41920' },
  { maskedName: '**O****', amount: '₦1,000,000,000,000', refCode: 'LAG-77102' },
  { maskedName: 'M*******', amount: '₦1,000,000,000,000', refCode: 'LAG-83921' },
  { maskedName: 'B*****', amount: '₦1,000,000,000,000', refCode: 'LAG-61204' },
  { maskedName: '**K****', amount: '₦1,000,000,000,000', refCode: 'LAG-90231' },
  { maskedName: 'D******', amount: '₦1,000,000,000,000', refCode: 'LAG-33918' },
  { maskedName: '**T****', amount: '₦1,000,000,000,000', refCode: 'LAG-12948' },
  { maskedName: 'F*****', amount: '₦1,000,000,000,000', refCode: 'LAG-60291' },
  { maskedName: '**S****', amount: '₦1,000,000,000,000', refCode: 'LAG-51029' },
  { maskedName: 'L******', amount: '₦1,000,000,000,000', refCode: 'LAG-34019' },
  { maskedName: '**U****', amount: '₦1,000,000,000,000', refCode: 'LAG-88203' },
  { maskedName: 'C*****', amount: '₦1,000,000,000,000', refCode: 'LAG-61928' },
  { maskedName: '**P****', amount: '₦1,000,000,000,000', refCode: 'LAG-40192' },
  { maskedName: 'H******', amount: '₦1,000,000,000,000', refCode: 'LAG-77291' },
  { maskedName: '**N****', amount: '₦1,000,000,000,000', refCode: 'LAG-50291' },
  { maskedName: 'R*****', amount: '₦1,000,000,000,000', refCode: 'LAG-91024' },
  { maskedName: '**E****', amount: '₦1,000,000,000,000', refCode: 'LAG-81920' },
  { maskedName: 'G******', amount: '₦1,000,000,000,000', refCode: 'LAG-28103' },
  { maskedName: '**J****', amount: '₦1,000,000,000,000', refCode: 'LAG-74910' },
  { maskedName: 'W*****', amount: '₦1,000,000,000,000', refCode: 'LAG-63910' },
  { maskedName: '**Y****', amount: '₦1,000,000,000,000', refCode: 'LAG-90281' },
  { maskedName: 'Z******', amount: '₦1,000,000,000,000', refCode: 'LAG-38192' },
  { maskedName: '**I****', amount: '₦1,000,000,000,000', refCode: 'LAG-10294' },
  { maskedName: 'V*****', amount: '₦1,000,000,000,000', refCode: 'LAG-99482' },
];

export interface ToastItem {
  id: string;
  maskedName: string;
  amount: string;
  refCode: string;
  timestamp: string;
  isExiting: boolean;
}

interface LiveClaimsFeedProps {
  isAdmin?: boolean;
  isLoginScreen?: boolean;
  isPaused?: boolean;
  onTogglePause?: () => void;
  isHidden?: boolean;
  onToggleHidden?: () => void;
}

export function LiveClaimsFeed({
  isAdmin = false,
  isPaused = false,
  onTogglePause,
  isHidden = false,
}: LiveClaimsFeedProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isMinimized, setIsMinimized] = useState<boolean>(isAdmin);
  const [localPaused, setLocalPaused] = useState<boolean>(false);
  const lastIndexRef = useRef<number>(-1);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

  const paused = isPaused || localPaused;

  useEffect(() => {
    if (isAdmin) {
      setIsMinimized(true);
    }
  }, [isAdmin]);

  const dismissToast = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleTogglePause = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (onTogglePause) {
      onTogglePause();
    } else {
      setLocalPaused((prev) => !prev);
    }
  };

  useEffect(() => {
    let isCancelled = false;

    const clearAllTimers = () => {
      timeoutsRef.current.forEach((t) => clearTimeout(t));
      timeoutsRef.current = [];
    };

    if (paused || isHidden) {
      clearAllTimers();
      return () => {
        isCancelled = true;
        clearAllTimers();
      };
    }

    const spawnToast = () => {
      if (isCancelled || paused || isHidden) return;

      // Do not trigger notifications or sounds if user is not currently active on the site
      if (typeof document !== 'undefined' && document.hidden) {
        const checkTimer = setTimeout(spawnToast, 2500);
        timeoutsRef.current.push(checkTimer);
        return;
      }

      // Pick next masked entry
      let nextIdx = Math.floor(Math.random() * REALISTIC_CLAIMS.length);
      if (nextIdx === lastIndexRef.current && REALISTIC_CLAIMS.length > 1) {
        nextIdx = (nextIdx + 1) % REALISTIC_CLAIMS.length;
      }
      lastIndexRef.current = nextIdx;
      const entry = REALISTIC_CLAIMS[nextIdx];

      const newToastId = `claim-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newToast: ToastItem = {
        id: newToastId,
        maskedName: entry.maskedName,
        amount: entry.amount,
        refCode: entry.refCode,
        timestamp: 'Just now',
        isExiting: false,
      };

      // Strict limit of 1 toast at a time: never stacks tall or blocks any icon!
      setToasts([newToast]);

      // Play subtle Lagos Life claim chime only when actively on the site
      try {
        if (typeof document === 'undefined' || !document.hidden) {
          playClaimNoticeSound();
        }
      } catch {
        // audio silently fails if not unlocked yet
      }

      // Exit transition at 4.6s
      const exitTimer = setTimeout(() => {
        if (isCancelled) return;
        setToasts((prev) =>
          prev.map((t) => (t.id === newToastId ? { ...t, isExiting: true } : t))
        );
      }, 4600);
      timeoutsRef.current.push(exitTimer);

      // DOM removal at 5.0s
      const removeTimer = setTimeout(() => {
        if (isCancelled) return;
        setToasts((prev) => prev.filter((t) => t.id !== newToastId));
      }, 5000);
      timeoutsRef.current.push(removeTimer);

      // Random interval between 3.5s and 6s
      const randomInterval = Math.floor(Math.random() * (6000 - 3500 + 1)) + 3500;
      const nextTimer = setTimeout(spawnToast, randomInterval);
      timeoutsRef.current.push(nextTimer);
    };

    // First appearance
    const initialTimer = setTimeout(spawnToast, 1800);
    timeoutsRef.current.push(initialTimer);

    return () => {
      isCancelled = true;
      clearAllTimers();
    };
  }, [paused, isHidden]);

  if (isHidden) {
    return null;
  }

  // Placed in its own dedicated bottom-right space:
  // - Away from header icons (L logo, MapPin, Logout)
  // - Away from centered card & crown icon
  // - Away from admin table usernames (on left)
  // - Zero collision with any icon or interactive button
  // - Full width allocation so the entire amount ₦1,000,000,000,000 is 100% visible
  return (
    <aside
      aria-label="Recent Claims Feed"
      className="fixed z-30 pointer-events-none transition-all duration-300 bottom-3 right-3 sm:bottom-4 sm:right-4 w-auto max-w-[calc(100vw-1.25rem)]"
    >
      {/* CASE A: MINIMIZED MICRO PILL */}
      {isMinimized ? (
        <div className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 backdrop-blur-md border border-[#cfe4f5] shadow-[0_4px_16px_rgba(28,37,52,0.1)] text-[10px]">
          <span className="relative flex h-1.5 w-1.5">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${paused ? 'bg-amber-400' : 'bg-[#449f73]'}`} />
            <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${paused ? 'bg-amber-500' : 'bg-[#449f73]'}`} />
          </span>
          <span className="font-semibold text-[#1c2534] text-[10px] tracking-tight">
            {paused ? 'Paused' : 'Claims'}
          </span>
          <div className="flex items-center gap-1 border-l border-[#e2e8f0] pl-1.5 ml-0.5">
            <button
              onClick={handleTogglePause}
              className="text-[#64748b] hover:text-[#1c2534] transition-colors cursor-pointer"
              title={paused ? 'Resume Live Feed' : 'Pause Live Feed'}
              aria-label={paused ? 'Resume Live Feed' : 'Pause Live Feed'}
            >
              {paused ? <BellOff className="w-2.5 h-2.5 text-amber-500" /> : <Bell className="w-2.5 h-2.5 text-[#64748b]" />}
            </button>
            <button
              onClick={() => setIsMinimized(false)}
              className="text-[#449f73] hover:text-[#2e7d54] font-bold text-[9px] transition-colors cursor-pointer flex items-center gap-0.5"
              title="Expand recent claims notifications"
            >
              <span>Expand</span>
              <ChevronUp className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      ) : (
        /* CASE B: ULTRA-COMPACT MICRO TOAST */
        <div className="flex flex-col gap-1.5 w-auto">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto group relative flex items-center gap-2 pl-2.5 pr-2 py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-[#cfe4f5] shadow-[0_4px_24px_rgba(28,37,52,0.12)] hover:border-[#449f73]/50 transition-all duration-300 ${
                toast.isExiting ? 'animate-toast-out' : 'animate-toast-in'
              }`}
              style={{ willChange: 'transform, opacity' }}
            >
              {/* Left icon: Tiny green checkmark badge */}
              <div className="w-4 h-4 rounded-md bg-[#eef8f3] border border-[#449f73]/30 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-3 h-3 text-[#449f73]" />
              </div>

              {/* Main Content: Single line, full amount completely visible */}
              <div className="flex flex-col justify-center whitespace-nowrap min-w-0 pr-1">
                <div className="flex items-center gap-1 text-[10px] sm:text-[11px] leading-tight">
                  <span className="font-mono font-bold text-[#1c2534] shrink-0">
                    {toast.maskedName}
                  </span>
                  <span className="text-[#64748b] text-[9.5px] sm:text-[10px] shrink-0 font-normal">claimed</span>
                  <span className="font-black text-[#2e7d54] tabular-nums tracking-normal shrink-0 text-[10.5px] sm:text-[11.5px] drop-shadow-[0_0_8px_rgba(46,125,84,0.18)]">
                    {toast.amount}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[8.5px] text-[#64748b] leading-none mt-0.5">
                  <span className="text-[#8292a4] font-mono text-[8px]">
                    {toast.refCode}
                  </span>
                  <span className="text-[#cbd5e1]">•</span>
                  <span className="text-[#449f73] font-medium">{toast.timestamp}</span>
                </div>
              </div>

              {/* Controls: Minimize & Dismiss */}
              <div className="flex items-center gap-0.5 shrink-0 pl-1 border-l border-[#e2e8f0]">
                <button
                  onClick={() => setIsMinimized(true)}
                  className="w-4 h-4 rounded flex items-center justify-center text-[#8292a4] hover:text-[#1c2534] hover:bg-[#f1f5f9] transition-colors cursor-pointer"
                  title="Minimize feed"
                  aria-label="Minimize feed"
                >
                  <ChevronDown className="w-2.5 h-2.5" />
                </button>
                <button
                  onClick={(e) => dismissToast(toast.id, e)}
                  className="w-4 h-4 rounded flex items-center justify-center text-[#8292a4] hover:text-[#1c2534] hover:bg-[#f1f5f9] transition-colors cursor-pointer"
                  title="Dismiss notification"
                  aria-label="Dismiss notification"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          ))}

          {/* Quick subtle toggle to minimize if no active toast */}
          {toasts.length === 0 && (
            <div className="flex justify-end">
              <button
                onClick={() => setIsMinimized(true)}
                className="pointer-events-auto text-[9px] text-[#64748b] hover:text-[#1c2534] px-2 py-0.5 rounded-full bg-white/90 border border-[#cfe4f5] shadow-xs transition-colors cursor-pointer"
              >
                Recent Claims • Active
              </button>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}


