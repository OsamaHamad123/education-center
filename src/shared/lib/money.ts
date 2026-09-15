/**
 * Money is stored as integer piasters — never floats (CLAUDE.md, "Coding conventions").
 * 1 EGP = 100 piasters. Teacher rates and payroll totals all flow through here.
 */

export const PIASTERS_PER_POUND = 100;

/** Branded so a raw number cannot be passed where piasters are expected by mistake. */
export type Piasters = number;

/** Converts pounds (as entered in a form) to piasters. Rejects sub-piaster precision. */
export function poundsToPiasters(pounds: number): Piasters {
  if (!Number.isFinite(pounds)) {
    throw new Error(`Invalid amount: ${pounds}`);
  }
  const piasters = Math.round(pounds * PIASTERS_PER_POUND);
  // Guard against float noise turning 12.005 into an unexpected value silently.
  if (Math.abs(pounds * PIASTERS_PER_POUND - piasters) > 0.001) {
    throw new Error(`Amount has more precision than one piaster: ${pounds}`);
  }
  return piasters;
}

/** Converts piasters back to pounds for display or CSV export. */
export function piastersToPounds(piasters: Piasters): number {
  assertPiasters(piasters);
  return piasters / PIASTERS_PER_POUND;
}

/**
 * Formats piasters as Egyptian pounds: `1,250.00 ج.م`.
 * Western digits, per PROJECT_PLAN section 12.
 */
export function formatEGP(piasters: Piasters): string {
  assertPiasters(piasters);
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(piastersToPounds(piasters));
  return `${formatted} ج.م`;
}

/** Sums piaster amounts. Kept here so payroll never reaches for a float reduce. */
export function sumPiasters(amounts: readonly Piasters[]): Piasters {
  return amounts.reduce<Piasters>((total, amount) => {
    assertPiasters(amount);
    return total + amount;
  }, 0);
}

function assertPiasters(value: number): void {
  if (!Number.isInteger(value)) {
    throw new Error(`Piasters must be an integer, got: ${value}`);
  }
}
