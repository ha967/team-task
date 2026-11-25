import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

export type KpiTone = 'mint' | 'ruby' | 'amber' | 'indigo' | 'neutral';

interface KpiCardProps {
  label: string;
  value: number;
  hint: string;
  tone?: KpiTone;
}

const TONE_CLASSES: Record<KpiTone, string> = {
  mint: 'bg-mint/10 text-mint',
  ruby: 'bg-ruby/10 text-ruby',
  amber: 'bg-amber/10 text-amber',
  indigo: 'bg-indigo-mist text-indigo',
  neutral: 'bg-panel-2 text-softink',
};

export function KpiCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: KpiCardProps) {
  const shown = useCountUp(value);

  return (
    <section className="panel p-5">
      <p className="caption">{label}</p>
      <div className="mt-2.5 flex flex-wrap items-end gap-x-2.5 gap-y-1">
        <span className="mono text-[28px] font-semibold leading-none tracking-[-0.02em]">
          {shown.toLocaleString('zh-CN')}
        </span>
        <span className={`chip h-5 px-2 text-[11px] ${TONE_CLASSES[tone]}`}>
          {hint}
        </span>
      </div>
    </section>
  );
}

// 首次出现时 0 → 目标值，时长 500ms；prefers-reduced-motion 下直接落到终值
function useCountUp(target: number, duration = 500) {
  const reduceMotion = useReducedMotion();
  const previous = useRef(0);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (reduceMotion) {
      previous.current = target;
      setShown(target);
      return;
    }

    const from = previous.current;

    if (from === target) {
      setShown(target);
      return;
    }

    let frame = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;

      setShown(Math.round(from + (target - from) * eased));

      if (progress < 1) {
        frame = window.requestAnimationFrame(tick);
      } else {
        previous.current = target;
      }
    };

    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
      previous.current = target;
    };
  }, [duration, reduceMotion, target]);

  return shown;
}
