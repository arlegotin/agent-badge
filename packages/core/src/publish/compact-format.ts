const rawIntegerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
  useGrouping: false
});

const rawUsdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

const compactUnits = [
  { threshold: 1_000_000_000, suffix: "B" },
  { threshold: 1_000_000, suffix: "M" },
  { threshold: 1_000, suffix: "K" }
] as const;

function formatCompactCore(value: number): string {
  const abs = Math.abs(value);

  for (const unit of compactUnits) {
    if (abs < unit.threshold) {
      continue;
    }

    const scaled = abs / unit.threshold;
    const maximumFractionDigits = abs >= 100_000_000 ? 0 : 1;
    const rendered = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits,
      useGrouping: false
    }).format(scaled);

    return `${value < 0 ? "-" : ""}${rendered}${unit.suffix}`;
  }

  return `${value < 0 ? "-" : ""}${rawIntegerFormatter.format(abs)}`;
}

export function formatCompactInteger(value: number): string {
  return formatCompactCore(value);
}

export function formatCompactUsd(value: number): string {
  if (Math.abs(value) < 1_000) {
    return rawUsdFormatter.format(value);
  }

  const sign = value < 0 ? "-" : "";
  return `${sign}$${formatCompactCore(Math.abs(value))}`;
}
