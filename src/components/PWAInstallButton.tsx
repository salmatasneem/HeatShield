import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';
import { AppLocale } from '../utils/i18n';

interface PWAInstallButtonProps {
  locale?: AppLocale;
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  locale = 'en',
  compact = false,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showManualGuide, setShowManualGuide] = useState(false);
  const isAr = locale === 'ar';

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`flex items-center gap-1.5 rounded-xl bg-[#A3E5C1] hover:bg-[#8cd8af] text-[#173829] font-extrabold shadow-xs transition-all cursor-pointer ${
          compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3.5 py-2 text-xs'
        }`}
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>{isAr ? 'تثبيت التطبيق' : 'Install App'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`flex items-center gap-1.5 rounded-xl bg-[#EBF5F0] hover:bg-[#DCEBE2] border border-[#C5DFD0] text-[#173829] font-bold transition-all cursor-pointer ${
            compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
          <span>{isAr ? 'تثبيت على iOS' : 'Install on iOS'}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-[#FAF8F3] border border-[#DED5C5] p-6 shadow-2xl space-y-3 text-[#173829]">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-black">
                  {isAr ? 'تثبيت على iPhone / iPad' : 'Install on iPhone / iPad'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg hover:bg-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-[#426050] leading-relaxed">
                1. Tap the <strong>Share</strong> icon in Safari.<br />
                2. Scroll down and tap <strong>Add to Home Screen</strong> to use HeatShield AI offline at the worksite.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-xl bg-[#173829] py-2 text-xs font-bold text-[#FAF8F3] cursor-pointer"
              >
                {isAr ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowManualGuide(true)}
        className={`flex items-center gap-1.5 rounded-xl bg-[#FAF8F3]/15 hover:bg-[#FAF8F3]/25 border border-[#A3E5C1]/50 text-[#FAF8F3] font-bold transition-all cursor-pointer print:hidden ${
          compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
        }`}
        title={isAr ? 'تثبيت وضع عدم الاتصال PWA' : 'Offline PWA Mode'}
      >
        <Smartphone className="w-3.5 h-3.5 text-[#A3E5C1] shrink-0" />
        <span>{isAr ? 'تثبيت PWA' : 'Offline App'}</span>
      </button>

      {showManualGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#FAF8F3] border border-[#DED5C5] p-6 shadow-2xl space-y-3 text-[#173829]">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black">
                {isAr ? 'وضع التطبيق بدون إنترنت (PWA)' : 'Offline-Ready Field App (PWA)'}
              </h3>
              <button
                type="button"
                onClick={() => setShowManualGuide(false)}
                className="p-1 rounded-lg hover:bg-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#426050] leading-relaxed">
              {isAr
                ? 'تقوم خدمة التخزين المؤقت (Service Worker) بحفظ آخر جدول معتمد وقواعد الامتثال للعمل في المواقع ذات الاتصال الضعيف. في متصفح Chrome/Edge اختر «تثبيت التطبيق» من شريط العنوان.'
                : 'HeatShield AI caches your last approved crew schedule, UAE compliance rules, and weather timestamp so sites work under poor connectivity. Use your browser address bar menu ("Install HeatShield") to pin to Home Screen / Desktop.'}
            </p>
            <button
              type="button"
              onClick={() => setShowManualGuide(false)}
              className="w-full rounded-xl bg-[#173829] py-2 text-xs font-bold text-[#FAF8F3] cursor-pointer"
            >
              {isAr ? 'حسناً' : 'Got it'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

interface OfflineModeBannerProps {
  lastUpdatedDisplay: string;
  isDataStale: boolean;
  locale?: AppLocale;
}

export const OfflineModeBanner: React.FC<OfflineModeBannerProps> = ({
  lastUpdatedDisplay,
  isDataStale,
  locale = 'en',
}) => {
  const isOnline = useOnlineStatus();
  const isAr = locale === 'ar';

  if (isOnline && !isDataStale) return null;

  return (
    <div
      role="status"
      className="bg-[#FEF3C7] border-b border-[#F59E0B] text-[#92400E] px-4 py-2 text-xs font-bold print:hidden"
    >
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <WifiOff className="w-4 h-4 shrink-0 text-[#B45309]" />
          <span>
            {isAr
              ? `وضع عدم الاتصال / البيانات الاحتياطية — المخرجات مبنية على آخر تحديث في ${lastUpdatedDisplay} (يتم تطبيق القيم المحافظة للسلامة).`
              : `OFFLINE / STALE MODE — Outputs are based on last update at ${lastUpdatedDisplay} using cached schedule, UAE rules & conservative safety defaults.`}
          </span>
        </span>
      </div>
    </div>
  );
};
