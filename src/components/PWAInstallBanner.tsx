import React, { useState } from 'react';
import { Download, Share, PlusSquare, X, Smartphone, CheckCircle2 } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // If already installed as a standalone PWA or user dismissed it in this session, do not show
  if (isInstalled || isDismissed) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      {/* Sleek, Non-Intrusive Clean App Banner */}
      <div className="w-full max-w-sm sm:max-w-md mx-auto mb-3 px-1 animate-fadeIn">
        <div className="flex items-center justify-between gap-2.5 px-3 py-2 rounded-2xl bg-white/95 border border-[#cfe4f5] shadow-xs backdrop-blur-md">
          <button
            type="button"
            onClick={handleInstallClick}
            className="flex items-center gap-2 text-left flex-1 min-w-0 cursor-pointer group"
          >
            <div className="w-7 h-7 rounded-xl bg-[#eef8f3] border border-[#449f73]/30 flex items-center justify-center shrink-0 text-[#2e7d54] group-hover:scale-105 transition-transform">
              <Smartphone className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-extrabold text-[#1c2534] tracking-tight flex items-center gap-1.5">
                <span>Open Clean &ldquo;Lagos Life&rdquo; App</span>
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-[#eef8f3] text-[#2e7d54] border border-[#449f73]/30">
                  No URL Bar
                </span>
              </div>
              <p className="text-[10px] text-[#64748b] truncate">
                {isIOS ? 'Add to Home Screen to remove the browser link' : 'Install app shortcut without technical links'}
              </p>
            </div>
          </button>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleInstallClick}
              className="px-2.5 py-1 rounded-xl bg-[#449f73] hover:bg-[#388862] text-white text-[11px] font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1"
            >
              <Download className="w-3 h-3" />
              <span>{isIOS ? 'Clean View' : 'Install'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsDismissed(true)}
              className="p-1 rounded-lg text-[#94a3b8] hover:text-[#1c2534] transition-colors cursor-pointer"
              title="Dismiss"
              aria-label="Dismiss banner"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Guided Modal for Clean App / Add to Home Screen */}
      {showGuide && (
        <div 
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn"
        >
          <div className="relative z-10 w-full max-w-sm glassmorphism-card p-6 bg-white shadow-2xl text-left border border-[#cfe4f5]">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-[#c3e2f7] border border-[#cfe4f5] flex items-center justify-center shadow-xs overflow-hidden">
                  <img src="/apple-touch-icon.png" alt="Lagos Life" className="w-9 h-9 rounded-lg" />
                </div>
                <div>
                  <h3 className="text-base font-black text-[#1c2534] tracking-tight">
                    Remove Link &amp; Open Clean
                  </h3>
                  <p className="text-xs text-[#64748b]">
                    Opens full screen as <strong>Lagos Life</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1.5 rounded-xl bg-[#f4f5f9] text-[#64748b] hover:text-[#1c2534] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[#475569] leading-relaxed mb-4">
              Because browsers automatically display server web addresses in the top bar, adding Lagos Life to your phone&apos;s home screen removes the link completely and runs it as a clean native app:
            </p>

            <div className="space-y-3 mb-5">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-[#f8fafc] border border-[#e2ecf4]">
                <div className="w-7 h-7 rounded-lg bg-[#eef8f3] border border-[#449f73]/30 flex items-center justify-center shrink-0 text-[#2e7d54] mt-0.5">
                  <Share className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#1c2534]">Step 1: Tap Share</div>
                  <div className="text-[11px] text-[#64748b]">
                    Tap the <strong>Share</strong> button at the bottom of Safari (or browser menu &bull;&bull;&bull;).
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-[#f8fafc] border border-[#e2ecf4]">
                <div className="w-7 h-7 rounded-lg bg-[#eef8f3] border border-[#449f73]/30 flex items-center justify-center shrink-0 text-[#2e7d54] mt-0.5">
                  <PlusSquare className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#1c2534]">Step 2: Add to Home Screen</div>
                  <div className="text-[11px] text-[#64748b]">
                    Scroll down and select <strong>&ldquo;Add to Home Screen&rdquo;</strong>, then tap <strong>Add</strong>.
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-xl bg-[#eef8f3] border border-[#449f73]/40">
                <div className="w-7 h-7 rounded-lg bg-[#2e7d54] text-white flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#2e7d54]">Step 3: Open Clean App</div>
                  <div className="text-[11px] text-[#2e7d54]/80">
                    Launch the Lagos Life icon from your home screen. The top browser link will be 100% gone!
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full py-2.5 px-4 rounded-xl bg-[#1c2534] hover:bg-[#2c3b52] text-white text-xs font-bold transition-colors cursor-pointer text-center"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
