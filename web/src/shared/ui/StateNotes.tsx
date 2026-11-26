import { Loader2 } from 'lucide-react';

export function LoadingState({
  label = '加载中…',
  bare = false,
}: {
  label?: string;
  bare?: boolean;
}) {
  return (
    <div
      className={`${
        bare ? '' : 'panel '
      }flex h-40 items-center justify-center gap-2 text-[13px] text-softink`}
    >
      <Loader2 size={16} className="animate-spin text-indigo" />
      {label}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-ruby/20 bg-ruby/5 px-3 py-2 text-[13px] leading-5 text-ruby">
      {message}
    </p>
  );
}
