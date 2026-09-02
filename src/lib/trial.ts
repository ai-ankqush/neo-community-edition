/** Trial state derived from the org's plan + trial_ends_at. */
export interface TrialState {
  onTrial: boolean;
  expired: boolean;
  daysLeft: number;
}

export function trialState(plan: string | null | undefined, trialEndsAt: string | null): TrialState {
  const onTrial = !plan || plan === "trial" || plan === "free";
  if (!onTrial || !trialEndsAt) return { onTrial, expired: false, daysLeft: 0 };
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return {
    onTrial,
    expired: ms <= 0,
    daysLeft: Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000))),
  };
}
