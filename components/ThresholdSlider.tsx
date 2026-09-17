"use client";

export default function ThresholdSlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const pct = Math.round(value * 100);
  return (
    <label className="block">
      <span className="flex items-center justify-between text-sm">
        <span className="text-ink-2">Confidence threshold</span>
        <span className="font-mono text-ink">{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={`${pct} percent`}
        className="mt-1.5 w-full"
      />
      <span className="mt-1 block text-xs text-muted">
        Below this, the router does not trust Jev&apos;s top pick. Model router → safe default. Tool router → ask the user.
      </span>
    </label>
  );
}
