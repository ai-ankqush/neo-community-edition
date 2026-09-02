import "server-only";
import type { ProviderRecipe, PreflightResult } from "./types";
import type { CheckResult } from "../types";
import { buildClient } from "../auth";
import { cloudRecipes } from "./cloud";
import { identityRecipes } from "./identity";
import { itsmRecipes } from "./itsm";
import { siemRecipes } from "./security";
import { aiRecipes } from "./ai";
import { platformRecipes } from "./platform";

export const RECIPES: Record<string, ProviderRecipe> = Object.fromEntries(
  [...cloudRecipes, ...identityRecipes, ...itsmRecipes, ...siemRecipes, ...aiRecipes, ...platformRecipes].map((r) => [r.id, r]),
);

export const ALL_RECIPES = Object.values(RECIPES);

export function getRecipe(id: string): ProviderRecipe | null {
  return RECIPES[id] ?? null;
}

/** Which recipe provides a capability (first match). */
export function recipeForCapability(capabilityId: string): ProviderRecipe | null {
  return ALL_RECIPES.find((r) => r.capabilities.some((c) => c.capabilityId === capabilityId)) ?? null;
}

export async function runPreflight(
  recipe: ProviderRecipe, credential: Record<string, unknown>,
): Promise<PreflightResult[]> {
  try {
    const client = await buildClient(recipe, credential);
    return await recipe.preflight(client, credential);
  } catch (e) {
    return [{ id: "auth", label: "Authentication", state: "auth_failed", detail: e instanceof Error ? e.message : "failed" }];
  }
}

export async function runRecipeCheck(
  recipe: ProviderRecipe, capabilityId: string,
  credential: Record<string, unknown>, params: Record<string, unknown>,
): Promise<CheckResult> {
  const cap = recipe.capabilities.find((c) => c.capabilityId === capabilityId);
  if (!cap) return { result: "error", note: `${recipe.name} does not provide ${capabilityId}` };
  try {
    const client = await buildClient(recipe, credential);
    const out = await cap.run(client, credential, params);
    return { ...out, triggerForRecheck: out.triggerForRecheck ?? "scheduled", validUntil: out.validUntil ?? new Date(Date.now() + cap.freshnessHours * 3600_000).toISOString() };
  } catch (e) {
    return { result: "error", note: e instanceof Error ? e.message : "check failed" };
  }
}
