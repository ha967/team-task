import { initialsFrom } from './initials';

interface MonogramTileProps {
  label: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-9 w-9 text-[12px]',
  lg: 'h-11 w-11 text-[14px]',
} as const;

// 模板里的商品没有图片，用 Indigo Mist 底 + Ink 首字母的方块代替
export function MonogramTile({
  label,
  size = 'md',
  className = '',
}: MonogramTileProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-indigo-mist font-semibold text-indigo ${SIZE_CLASSES[size]} ${className}`}
    >
      {initialsFrom(label)}
    </span>
  );
}
