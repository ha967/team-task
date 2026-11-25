import { useId, useState, type PointerEvent } from 'react';
import type { ActivityPoint } from '../metrics';

const WIDTH = 640;
const HEIGHT = 220;
const PAD = { top: 16, right: 16, bottom: 30, left: 16 };

const INNER_WIDTH = WIDTH - PAD.left - PAD.right;
const INNER_HEIGHT = HEIGHT - PAD.top - PAD.bottom;
const BASELINE = PAD.top + INNER_HEIGHT;

interface ActivityChartProps {
  points: ActivityPoint[];
}

/**
 * 手写 SVG 面积图：catmull-rom 转 bezier 平滑曲线、Indigo 渐变填充、
 * 桌面端指针悬停显示十字线和数值气泡。不引图表库。
 */
export function ActivityChart({ points }: ActivityChartProps) {
  const gradientId = useId().replace(/:/g, '');
  const [hovered, setHovered] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <p className="mt-6 text-[13px] text-softink">还没有可展示的任务。</p>
    );
  }

  const max = Math.max(1, ...points.map((point) => point.value));
  const xAt = (index: number) =>
    points.length === 1
      ? PAD.left + INNER_WIDTH / 2
      : PAD.left + (index / (points.length - 1)) * INNER_WIDTH;
  const yAt = (value: number) =>
    PAD.top + INNER_HEIGHT - (value / max) * INNER_HEIGHT;

  const coordinates = points.map(
    (point, index) => [xAt(index), yAt(point.value)] as const,
  );
  const linePath = smoothPath(coordinates);
  const areaPath = `${linePath} L${
    coordinates[coordinates.length - 1][0]
  },${BASELINE} L${coordinates[0][0]},${BASELINE} Z`;

  const labelIndexes = points
    .map((_, index) => index)
    .filter((index) => index % 5 === 0 || index === points.length - 1);

  const hoveredPoint = hovered === null ? null : points[hovered];
  const hoveredX = hovered === null ? 0 : xAt(hovered);
  const hoveredY = hovered === null ? 0 : yAt(points[hovered].value);

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const cursorX = ((event.clientX - rect.left) / rect.width) * WIDTH;
    const rawIndex = ((cursorX - PAD.left) / INNER_WIDTH) * (points.length - 1);

    setHovered(Math.max(0, Math.min(points.length - 1, Math.round(rawIndex))));
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="mt-4 h-auto w-full touch-pan-y"
      role="img"
      aria-label="最近 30 天每天新建任务数量走势"
      onPointerMove={handlePointerMove}
      onPointerLeave={() => {
        setHovered(null);
      }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#4F46E5" stopOpacity="0" />
        </linearGradient>
      </defs>

      {[0, 0.5, 1].map((ratio) => {
        const y = PAD.top + INNER_HEIGHT * ratio;

        return (
          <line
            key={ratio}
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={y}
            y2={y}
            stroke="#E3E5EA"
            strokeWidth={1}
            strokeDasharray={ratio === 1 ? undefined : '3 4'}
          />
        );
      })}

      <g className="chart-reveal">
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path
          d={linePath}
          fill="none"
          stroke="#4F46E5"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {hoveredPoint === null ? null : (
        <g pointerEvents="none">
          <line
            x1={hoveredX}
            x2={hoveredX}
            y1={PAD.top}
            y2={BASELINE}
            stroke="#C9CBD3"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <circle
            cx={hoveredX}
            cy={hoveredY}
            r={4}
            fill="#4F46E5"
            stroke="#FFFFFF"
            strokeWidth={2}
          />
          <g
            transform={`translate(${clamp(hoveredX, 62, WIDTH - 62)}, ${Math.max(
              hoveredY - 42,
              34,
            )})`}
          >
            <rect
              x={-60}
              y={-30}
              width={120}
              height={38}
              rx={8}
              fill="#171A20"
            />
            <text
              x={0}
              y={-16}
              textAnchor="middle"
              fontSize={10}
              fill="#A6AAB4"
              fontFamily="JetBrains Mono, monospace"
            >
              {hoveredPoint.label}
            </text>
            <text
              x={0}
              y={-3}
              textAnchor="middle"
              fontSize={12}
              fill="#FFFFFF"
              fontFamily="JetBrains Mono, monospace"
            >
              {hoveredPoint.value} 个任务
            </text>
          </g>
        </g>
      )}

      {labelIndexes.map((index) => (
        <text
          key={index}
          x={xAt(index)}
          y={HEIGHT - 8}
          textAnchor={
            index === 0
              ? 'start'
              : index === points.length - 1
                ? 'end'
                : 'middle'
          }
          fontSize={10}
          fill="#5F6570"
          fontFamily="JetBrains Mono, monospace"
        >
          {points[index].label}
        </text>
      ))}
    </svg>
  );
}

function smoothPath(points: ReadonlyArray<readonly [number, number]>) {
  if (points.length === 0) {
    return '';
  }

  if (points.length === 1) {
    return `M${points[0][0]},${points[0][1]}`;
  }

  let path = `M${points[0][0]},${points[0][1]}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    const afterNext = points[index + 2] ?? next;

    const control1X = current[0] + (next[0] - previous[0]) / 6;
    const control1Y = current[1] + (next[1] - previous[1]) / 6;
    const control2X = next[0] - (afterNext[0] - current[0]) / 6;
    const control2Y = next[1] - (afterNext[1] - current[1]) / 6;

    path += ` C${control1X},${control1Y} ${control2X},${control2Y} ${next[0]},${next[1]}`;
  }

  return path;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
