const rawIntegerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
  useGrouping: false
});

const compactIntegerFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1
});

const compactUsdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  compactDisplay: "short",
  maximumFractionDigits: 1
});

function normalizeCompactSuffix(value: string): string {
  return value.replace(/\.0(?=[A-Za-z])/g, "").replace(/K\b/g, "k");
}

export function formatCompactInteger(value: number): string {
  if (Math.abs(value) < 1_000) {
    return rawIntegerFormatter.format(value);
  }

  return normalizeCompactSuffix(compactIntegerFormatter.format(value));
}

export function formatCompactUsd(value: number): string {
  if (Math.abs(value) < 1_000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  return normalizeCompactSuffix(compactUsdFormatter.format(value));
}
