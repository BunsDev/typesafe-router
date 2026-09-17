"use client";

export default function ThresholdSlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const pct = Math.round(value * 100);
  return (
    <div>
      <label className="block">
        <span className="flex items-baseline justify-between">
          <span className="text-sm text-ink-2">Confidence threshold</span>
          <span className="tnum font-mono text-sm text-ink">{value.toFixed(2)}</span>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-valuetext={`${pct} percent`}
          className="mt-2 block w-full"
        />
      </label>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">
        Below this, Jev&apos;s top pick isn&apos;t trusted. Model router falls back to the safe default. Tool router asks the user.
      </p>
    </div>
  );
}
