import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastApi {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
  warning: (msg: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-5 h-5" />,
  error: <XCircle className="w-5 h-5" />,
  info: <Info className="w-5 h-5" />,
  warning: <AlertTriangle className="w-5 h-5" />,
};

const STYLES: Record<ToastType, string> = {
  success: 'border-r-4 border-r-emerald-500 border-y-slate-100 border-l-slate-100 text-slate-800 bg-white/90 backdrop-blur-md [&_.toast-icon]:text-emerald-500',
  error: 'border-r-4 border-r-rose-500 border-y-slate-100 border-l-slate-100 text-slate-800 bg-white/90 backdrop-blur-md [&_.toast-icon]:text-rose-500',
  info: 'border-r-4 border-r-indigo-500 border-y-slate-100 border-l-slate-100 text-slate-800 bg-white/90 backdrop-blur-md [&_.toast-icon]:text-indigo-500',
  warning: 'border-r-4 border-r-amber-500 border-y-slate-100 border-l-slate-100 text-slate-800 bg-white/90 backdrop-blur-md [&_.toast-icon]:text-amber-500',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const push = useCallback((type: ToastType, message: string) => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, type, message }]);
    window.setTimeout(() => remove(id), 4000);
  }, [remove]);

  const api: ToastApi = {
    success: (m) => push('success', m),
    error: (m) => push('error', m),
    info: (m) => push('info', m),
    warning: (m) => push('warning', m),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Toast viewport — top center, RTL-safe */}
      <div
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[10000] flex flex-col items-center gap-2 w-full max-w-sm px-4 pointer-events-none"
        dir="rtl"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map(t => (
          <div
            key={t.id}
            role="status"
            className={`animate-toast-in pointer-events-auto w-full border ${STYLES[t.type]} rounded-2xl shadow-[0_10px_30px_rgba(15,23,42,0.08)] px-4 py-3.5 flex items-center gap-3 transition-all duration-300 hover:shadow-[0_12px_36px_rgba(15,23,42,0.12)]`}
          >
            <span className="toast-icon flex-shrink-0 animate-pulse">{ICONS[t.type]}</span>
            <p className="flex-1 text-xs font-bold text-slate-700 leading-snug">{t.message}</p>
            <button
              onClick={() => remove(t.id)}
              className="flex-shrink-0 text-slate-400 hover:text-slate-650 transition-colors cursor-pointer p-0.5 hover:bg-slate-100 rounded-md"
              aria-label="إغلاق"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
