import { initialsFrom } from './initials';

interface InitialsDotProps {
  name: string | null;
  className?: string;
}

// 负责人 / 用户头像：没有照片，只有首字母圆点；未指派用虚线空心圈
export function InitialsDot({ name, className = '' }: InitialsDotProps) {
  if (!name) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-line text-[10px] text-softink ${className}`}
      >
        –
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      title={name}
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-mist text-[10px] font-semibold leading-none text-indigo ${className}`}
    >
      {initialsFrom(name, 2)}
    </span>
  );
}
