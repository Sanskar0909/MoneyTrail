import { useState, type CSSProperties, type PointerEvent } from 'react';

export interface ChartBar {
  key: string;
  /** How tall the bar is, in the same unit as the chart's `max`. */
  value: number;
  /** Printed under the bar. Empty for no label. */
  tick: string;
  /** A shorter label for narrow screens, where twelve month names don't fit. */
  tickNarrow?: string;
  /** What the bar stands for, e.g. "October 2026". */
  label: string;
  /** The value, already formatted for reading. */
  valueText: string;
  /** A line of context, e.g. "14 receipts". */
  detail: string;
  /** Makes the bar a link. */
  href?: string;
  isSelected?: boolean;
}

export interface ChartTick {
  value: number;
  label: string;
}

interface BarChartProps {
  /** What the chart shows, for screen readers. */
  label: string;
  bars: ChartBar[];
  /** The value at the top of the plot. */
  max: number;
  ticks: ChartTick[];
  /** Paints every bar grey except the selected one, so the chart reads as "this one, in context". */
  emphasis?: boolean;
  size?: 'tall' | 'short';
}

/**
 * A column chart of one series, drawn with plain elements rather than a chart library: twelve or
 * thirty-one bars don't need one.
 *
 * Each bar's hit area is its whole column, not just the painted part, so a short bar is as easy to
 * point at as a tall one. Hovering shows the exact value; the same values are reachable without
 * hovering through the table the overview offers under the charts.
 */
export function BarChart({ label, bars, max, ticks, emphasis = false, size = 'tall' }: BarChartProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const activeIndex = bars.findIndex((bar) => bar.key === activeKey);
  const active = activeIndex >= 0 ? bars[activeIndex] : undefined;
  const isNavigable = bars.some((bar) => bar.href !== undefined);

  const heightOf = (bar: ChartBar) => Math.min(100, Math.max(0, (bar.value / max) * 100));

  // Touch has no hover: a touch "enters" and "leaves" within one tap, which would flash the tooltip.
  // So only a mouse drives it here, and a tap is handled as a click below.
  const hoverHandlers = (bar: ChartBar) => ({
    onPointerEnter: (event: PointerEvent) => {
      if (event.pointerType === 'mouse') setActiveKey(bar.key);
    },
    onPointerLeave: (event: PointerEvent) => {
      if (event.pointerType === 'mouse') setActiveKey(null);
    },
  });

  return (
    <div
      className="chart"
      data-size={size}
      data-emphasis={emphasis || undefined}
      style={{ '--bars': bars.length } as CSSProperties}
    >
      <div className="chart-plot">
        <div className="chart-grid" aria-hidden="true">
          {ticks.map((tick) => (
            <div
              key={tick.value}
              className="chart-gridline"
              data-baseline={tick.value === 0 || undefined}
              style={{ bottom: `${(tick.value / max) * 100}%` }}
            >
              <span>{tick.label}</span>
            </div>
          ))}
        </div>

        {/* Bars that are links are real navigation, so they are read out. Bars that aren't are
            hidden from screen readers: the table under the charts says the same thing better. */}
        <ol className="chart-bars" aria-label={label} aria-hidden={!isNavigable || undefined}>
          {bars.map((bar) => {
            const fill =
              bar.value > 0 ? <span className="chart-bar" style={{ height: `${heightOf(bar)}%` }} /> : null;

            if (bar.href !== undefined) {
              return (
                <li key={bar.key} className="chart-slot">
                  <a
                    className="chart-hit"
                    href={bar.href}
                    aria-label={`${bar.label}: ${bar.valueText}, ${bar.detail}`}
                    aria-current={bar.isSelected ? 'true' : undefined}
                    data-selected={bar.isSelected || undefined}
                    {...hoverHandlers(bar)}
                    onFocus={(event) => {
                      // Only for keyboard focus. A tapped link is focused too, and would leave a
                      // tooltip stuck over the bar that was just selected.
                      if (event.currentTarget.matches(':focus-visible')) setActiveKey(bar.key);
                    }}
                    onBlur={() => setActiveKey(null)}
                  >
                    {fill}
                  </a>
                </li>
              );
            }

            return (
              <li key={bar.key} className="chart-slot">
                {bar.value > 0 && (
                  <span
                    className="chart-hit"
                    {...hoverHandlers(bar)}
                    onClick={() => setActiveKey((current) => (current === bar.key ? null : bar.key))}
                  >
                    {fill}
                  </span>
                )}
              </li>
            );
          })}
        </ol>

        {active && (
          <div
            className="chart-tip"
            aria-hidden="true"
            data-edge={
              activeIndex < bars.length * 0.2 ? 'start' : activeIndex > bars.length * 0.8 ? 'end' : undefined
            }
            style={{
              left: `${((activeIndex + 0.5) / bars.length) * 100}%`,
              bottom: `calc(${heightOf(active)}% + 10px)`,
            }}
          >
            <strong>{active.valueText}</strong>
            <span>{active.label}</span>
            <span>{active.detail}</span>
          </div>
        )}
      </div>

      <div className="chart-axis" aria-hidden="true">
        {bars.map((bar) => (
          <span key={bar.key} data-selected={bar.isSelected || undefined}>
            {bar.tick !== '' && (
              <>
                <span className="tick-wide">{bar.tick}</span>
                <span className="tick-narrow">{bar.tickNarrow ?? bar.tick}</span>
              </>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
