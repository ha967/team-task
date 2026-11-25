import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

type ToastTone = 'success' | 'info' | 'error';

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

type PushToast = (message: string, tone?: ToastTone) => void;

const ToastContext = createContext<PushToast | null>(null);

// 与 global.css 里 .toast-progress 的 2.8s 对齐，避免进度条先走完再空等
const TOAST_LIFETIME = 2800;

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'text-mint',
  info: 'text-indigo',
  error: 'text-ruby',
};

const TONE_ICONS = {
  success: CheckCircle2,
  info: Info,
  error: AlertCircle,
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const push = useCallback<PushToast>((message, tone = 'success') => {
    const id = nextId.current;
    nextId.current += 1;

    setItems((current) => [...current, { id, message, tone }]);

    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, TOAST_LIFETIME);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-20 right-4 z-[60] flex w-[min(92vw,360px)] flex-col gap-2 nav:bottom-5 nav:right-5"
      >
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <ToastRow key={item.id} toast={item} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast 必须在 ToastProvider 内部使用');
  }

  return context;
}

function ToastRow({ toast }: { toast: ToastItem }) {
  const reduceMotion = useReducedMotion();
  const Icon = TONE_ICONS[toast.tone];

  return (
    <motion.div
      layout
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{
        duration: reduceMotion ? 0.01 : 0.18,
        ease: [0.22, 0.61, 0.36, 1],
      }}
      className="pointer-events-auto overflow-hidden rounded-full border border-line bg-panel shadow-[0_8px_24px_rgb(18_19_26/0.10)]"
    >
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <Icon size={16} className={TONE_STYLES[toast.tone]} />
        <p className="text-[13px] font-medium leading-none text-ink">
          {toast.message}
        </p>
      </div>
      <span className="toast-progress block h-0.5 bg-indigo/60" />
    </motion.div>
  );
}
