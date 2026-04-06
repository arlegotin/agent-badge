const rawIntegerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
  useGrouping: false
});

const compactUnits = [
  { threshold: 1_000_000_000, suffix: "B" },
  { threshold: 1_000_000, suffix: "M" },
  { threshold: 1_000, suffix: "K" }
] as const;

function formatRawUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.abs(value) >= 10 ? 0 : 2
  }).format(value);
}

function formatCompactFromIndex(abs: number, index: number): string {
  const unit = compactUnits[index];
  const scaled = abs / unit.threshold;
  const rendered = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: scaled >= 100 ? 0 : 1,
    useGrouping: false
  }).format(scaled);
  const rounded = Number.parseFloat(rendered);

  if (rounded >= 1000 && index > 0) {
    return formatCompactFromIndex(abs, index - 1);
  }

  return `${rendered}${unit.suffix}`;
}

function formatCompactCore(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  for (let index = 0; index < compactUnits.length; index += 1) {
    if (abs < compactUnits[index].threshold) {
      continue;
    }

    return `${sign}${formatCompactFromIndex(abs, index)}`;
  }

  return `${sign}${rawIntegerFormatter.format(abs)}`;
}

export function formatCompactInteger(value: number): string {
  return formatCompactCore(value);
}

export function formatCompactUsd(value: number): string {
  if (Math.abs(value) < 1_000) {
    return formatRawUsd(value);
  }

  const sign = value < 0 ? "-" : "";
  return `${sign}$${formatCompactCore(Math.abs(value))}`;
}
