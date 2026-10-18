export const NEGOTIATION_LIMIT_DEFAULTS = {
  max_discount_pct: 30,
  counter_band_min_pct: 58,
  counter_band_max_pct: 78,
  lowball_threshold_pct: 60,
  lowball_hardening_per_repeat_pct: 3,
  lowball_hardening_severity_pct: 6,
  round1_max_discount_pct: 12,
  round2_max_discount_pct: 18,
  round3_max_discount_pct: 24,
  roundN_max_discount_pct: 30,
  probing_guard_trigger_floor_pct: 75,
  probing_guard_span_pct: 25,
  offer_influence_low_pct: 22,
  offer_influence_normal_pct: 34,
  counter_jitter_step_gs: 1000,
  counter_jitter_min_steps: -1,
  counter_jitter_max_steps: 2,
} as const;

export type NegotiationLimitKey = keyof typeof NEGOTIATION_LIMIT_DEFAULTS;
export const APPLIED_NEGOTIATION_LIMIT_IDS = Object.keys(NEGOTIATION_LIMIT_DEFAULTS) as NegotiationLimitKey[];

export function effectiveNegotiationLimitValue(
  limit: { key: string; value: number | string; is_active: boolean },
): number {
  const fallback = NEGOTIATION_LIMIT_DEFAULTS[limit.key as NegotiationLimitKey];
  const value = Number(limit.value);
  return limit.is_active && Number.isFinite(value)
    ? value
    : (fallback ?? (Number.isFinite(value) ? value : 0));
}