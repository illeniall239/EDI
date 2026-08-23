'use client';

import { useMemo, useState } from 'react';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Scatter,
    ScatterChart,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import type { ChartSpec } from '@/types';

/**
 * Series colours.
 *
 * The app is monochrome, so identity is carried by lightness alone. Greys stop
 * being distinguishable quickly: this set sits at dE 22.9 between adjacent
 * steps (comfortably over the dE 15 floor below which a pair reads as the same
 * colour even with full colour vision) and every step clears 3:1 contrast
 * against the dark surface. A fourth grey cannot do both, which is why the
 * backend caps a chart at three series.
 */
const SERIES_COLORS = ['#ffffff', '#b3b3b3', '#6e6e6e'];

// Recessive chrome: grid and axes must not compete with the data.
const GRID = '#242424';
const AXIS_INK = '#a4a4a4';
const SURFACE = '#090909';

/** Slice fills for a pie, ordered light -> dark by magnitude. */
function pieRamp(count: number): string[] {
    if (count <= 1) return ['#ffffff'];
    // Sequential, not categorical: slices are ordered by size, so lightness
    // encodes magnitude rather than identity.
    const start = 96;
    const end = 42;
    return Array.from({ length: count }, (_, i) => {
        const l = Math.round(start - ((start - end) * i) / (count - 1));
        const hex = Math.round((l / 100) * 255)
            .toString(16)
            .padStart(2, '0');
        return `#${hex}${hex}${hex}`;
    });
}

function formatValue(value: unknown): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) return String(value ?? '');
    if (Number.isInteger(value)) return value.toLocaleString();
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Truncate long category names so the axis stays readable. */
function shortLabel(value: unknown): string {
    const text = String(value ?? '');
    return text.length > 16 ? `${text.slice(0, 15)}…` : text;
}

interface TooltipEntry {
    name?: string;
    value?: unknown;
    color?: string;
}

function ChartTooltip({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: TooltipEntry[];
    label?: unknown;
}) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-md border border-white/15 bg-black/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm">
            <div className="mb-1 font-medium text-white">{String(label ?? '')}</div>
            {payload.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 text-gray-300">
                    {/* The swatch carries identity; the text stays in ink. */}
                    <span
                        className="inline-block h-2 w-2 rounded-sm"
                        style={{ background: entry.color }}
                    />
                    <span>{entry.name}</span>
                    <span className="ml-auto font-mono text-white">{formatValue(entry.value)}</span>
                </div>
            ))}
        </div>
    );
}

export function ChartRenderer({ spec }: { spec: ChartSpec }) {
    const [showTable, setShowTable] = useState(false);

    const { chart_type: chartType, x_key: xKey, series, data, title } = spec;
    const seriesKeys = useMemo(() => series ?? [], [series]);
    const multi = seriesKeys.length > 1;

    if (!data?.length || !seriesKeys.length) {
        return (
            <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-gray-400">
                No data to chart.
            </div>
        );
    }

    const axisProps = {
        stroke: AXIS_INK,
        tick: { fill: AXIS_INK, fontSize: 11 },
        tickLine: false,
    };

    /**
     * Series whose magnitudes differ wildly cannot share a y-axis -- plotting a
     * ~7 average next to a ~1200 average flattens the smaller one to nothing.
     * Rather than a second y-axis (which makes the crossover point arbitrary
     * and misleads), split into one chart per series.
     */
    const magnitudes = seriesKeys.map((s) =>
        Math.max(...data.map((row) => Math.abs(Number(row[s.key]) || 0)), 0)
    );
    const nonZero = magnitudes.filter((m) => m > 0);
    const splitScales =
        chartType !== 'pie' &&
        seriesKeys.length > 1 &&
        nonZero.length > 1 &&
        Math.max(...nonZero) > 10 * Math.min(...nonZero);

    const buildChart = (
        keys: typeof seriesKeys,
        colors: string[],
        showLegend: boolean
    ): React.ReactElement => {
    const common = (
        <>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey={xKey} {...axisProps} tickFormatter={shortLabel} interval={0} angle={data.length > 6 ? -35 : 0} textAnchor={data.length > 6 ? 'end' : 'middle'} height={data.length > 6 ? 64 : 30} />
            <YAxis {...axisProps} width={52} tickFormatter={(v) => formatValue(v)} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.06)' }} />
            {/* A single series is named by the title, so no legend box. */}
            {showLegend && <Legend wrapperStyle={{ fontSize: 11, color: AXIS_INK }} />}
        </>
    );

    let chart: React.ReactElement;

    if (chartType === 'pie') {
        const key = keys[0].key;
        const ramp = pieRamp(data.length);
        chart = (
            <PieChart>
                <Pie
                    data={data}
                    dataKey={key}
                    nameKey={xKey}
                    outerRadius="78%"
                    // 2px surface gap so adjacent slices never touch.
                    stroke={SURFACE}
                    strokeWidth={2}
                    label={({ name, percent }) =>
                        `${shortLabel(name)} ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                    labelLine={false}
                >
                    {data.map((_, i) => (
                        <Cell key={i} fill={ramp[i]} />
                    ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
            </PieChart>
        );
    } else if (chartType === 'line') {
        chart = (
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                {common}
                {keys.map((s, i) => (
                    <Line
                        key={s.key}
                        type="monotone"
                        dataKey={s.key}
                        name={s.label}
                        stroke={colors[i]}
                        strokeWidth={2}
                        dot={{ r: 4, fill: colors[i], stroke: SURFACE, strokeWidth: 2 }}
                        activeDot={{ r: 5 }}
                    />
                ))}
            </LineChart>
        );
    } else if (chartType === 'area') {
        chart = (
            <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                <defs>
                    {keys.map((s, i) => (
                        <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={colors[i]} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={colors[i]} stopOpacity={0.03} />
                        </linearGradient>
                    ))}
                </defs>
                {common}
                {keys.map((s, i) => (
                    <Area
                        key={s.key}
                        type="monotone"
                        dataKey={s.key}
                        name={s.label}
                        stroke={colors[i]}
                        strokeWidth={2}
                        fill={`url(#fill-${s.key})`}
                    />
                ))}
            </AreaChart>
        );
    } else if (chartType === 'scatter') {
        chart = (
            <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                {common}
                {keys.map((s, i) => (
                    <Scatter
                        key={s.key}
                        data={data}
                        dataKey={s.key}
                        name={s.label}
                        fill={colors[i]}
                        // >= 8px markers, ringed so overlaps stay readable.
                        shape="circle"
                        stroke={SURFACE}
                        strokeWidth={2}
                    />
                ))}
            </ScatterChart>
        );
    } else {
        chart = (
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }} barGap={2}>
                {common}
                {keys.map((s, i) => (
                    <Bar
                        key={s.key}
                        dataKey={s.key}
                        name={s.label}
                        fill={colors[i]}
                        // Rounded data-end only; the bar stays anchored to the baseline.
                        radius={[4, 4, 0, 0]}
                        maxBarSize={48}
                    />
                ))}
            </BarChart>
        );
    }

        return chart;
    };

    return (
        <div className="w-full rounded-lg border border-white/10 bg-white/[0.03] p-3">
            {title && (
                <div className="mb-2 px-1 text-sm font-medium text-white">{title}</div>
            )}

            {splitScales ? (
                // Small multiples: one panel per series, each with its own
                // y-axis, so neither measure is flattened by the other.
                seriesKeys.map((s, i) => (
                    <div key={s.key} className={i > 0 ? 'mt-3' : ''}>
                        <div className="px-1 pb-1 text-xs text-gray-400">{s.label}</div>
                        <div className="h-52 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                {buildChart([s], [SERIES_COLORS[i]], false)}
                            </ResponsiveContainer>
                        </div>
                    </div>
                ))
            ) : (
                <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        {buildChart(seriesKeys, SERIES_COLORS, multi)}
                    </ResponsiveContainer>
                </div>
            )}

            {/* Table view: identity is never colour-alone, and this is the
                relief route for anyone who cannot separate the greys. */}
            <button
                onClick={() => setShowTable((v) => !v)}
                className="mt-2 w-full rounded border border-white/20 bg-black py-1 px-2 text-xs text-white transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
            >
                {showTable ? 'Hide data' : 'View data'}
            </button>

            {showTable && (
                <div className="mt-2 max-h-56 overflow-auto rounded border border-white/10">
                    <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-black/95 text-gray-400">
                            <tr>
                                <th className="px-2 py-1 font-medium">{xKey}</th>
                                {seriesKeys.map((s) => (
                                    <th key={s.key} className="px-2 py-1 text-right font-medium">
                                        {s.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="text-gray-200">
                            {data.map((row, i) => (
                                <tr key={i} className="border-t border-white/5">
                                    <td className="px-2 py-1">{String(row[xKey] ?? '')}</td>
                                    {seriesKeys.map((s) => (
                                        <td key={s.key} className="px-2 py-1 text-right font-mono">
                                            {formatValue(row[s.key])}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

/**
 * Renders the pre-spec visualization shapes that may still exist in saved chat
 * history. The images they point at were written to the backend's local disk
 * and never persisted, so these will usually fail to load -- this exists so old
 * messages degrade gracefully rather than showing a raw "unknown type" box.
 */
export function LegacyChartImage({
    viz,
    baseUrl,
    onExpand,
    onDownload,
}: {
    viz: { type: 'matplotlib_figure' | 'plotly_html'; path: string };
    baseUrl: string;
    onExpand: (url: string) => void;
    onDownload: (path: string, type: string) => void;
}) {
    const src = `${baseUrl}${viz.path}`;
    return (
        <>
            {viz.type === 'plotly_html' ? (
                <iframe src={src} className="w-full h-40 rounded-lg border-0" />
            ) : (
                <div className="relative w-full max-w-2xl mx-auto">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={src}
                        alt="Data Visualization"
                        className="rounded-lg w-full h-auto cursor-pointer hover:opacity-90 transition-opacity"
                        style={{ maxHeight: '400px' }}
                        onClick={() => onExpand(src)}
                    />
                </div>
            )}
            <button
                onClick={() => onDownload(viz.path, viz.type)}
                className="w-full text-xs bg-black hover:bg-black/90 text-white rounded py-1 px-2 transition-colors focus:outline-none focus:ring-2 focus:ring-white/20 border border-white/20"
            >
                Save Chart
            </button>
        </>
    );
}
