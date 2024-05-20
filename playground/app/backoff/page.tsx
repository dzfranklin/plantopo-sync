"use client";

import * as Plot from "@observablehq/plot";
import { useEffect, useRef, useState } from "react";

export default function BackoffPage() {
  const plotRef = useRef<HTMLDivElement>(null);

  const [intervalMs, setIntervalMs] = useState(50);
  const [rate, setRate] = useState(2);
  const [maxMs, setMaxMs] = useState(300_000);

  useEffect(() => {
    const container = plotRef.current;
    const data = computeData(intervalMs, rate, maxMs);
    console.log(data);
    const plot = Plot.plot({
      height: 600,
      width: 800,
      marks: [Plot.dot(data, { x: "i", y: "backoff", tip: true })],
      x: { label: "Failures" },
      y: { grid: true, label: "Backoff (s)" },
    });
    container?.append(plot);
    return () => plot.remove();
  }, [intervalMs, rate, maxMs]);

  return (
    <div className="m-5">
      <div className="flex flex-col gap-2 mb-10">
        <Input
          label="Interval (ms)"
          value={intervalMs}
          step={200}
          onChange={setIntervalMs}
        />
        <Input label="Rate" value={rate} onChange={setRate} />
        <Input
          label="Max (s)"
          value={maxMs / 1000}
          onChange={(value) => setMaxMs(value * 1000)}
        />
      </div>

      <div ref={plotRef} />
    </div>
  );
}

function computeData(intervalMs: number, rate: number, maxMs: number) {
  const data = [];
  let backoff = 0;
  let run = 0;
  for (let i = 0; ; i++) {
    data.push({ i, backoff });
    const jitter = Math.floor(Math.random() * intervalMs);
    backoff = Math.min(maxMs, intervalMs * rate ** i + jitter) / 1000;

    if (run > 2) break;
    if (backoff * 1000 >= maxMs) run++;
  }
  return data;
}

function Input({
  label,
  value,
  step,
  onChange,
}: {
  label?: string;
  value?: number;
  step?: number;
  onChange?: (value: number) => void;
}) {
  return (
    <label className="text-sm">
      {label}
      <input
        type="number"
        className="ml-1 border border-gray-300 rounded"
        value={value}
        step={step}
        onChange={(e) => onChange?.(Number(e.target.value))}
      />
    </label>
  );
}
