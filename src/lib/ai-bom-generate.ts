/** Generate a CycloneDX ML-BOM for a use case from what the assessment already
 *  captured — the declared models/stack and the classification (what the AI can
 *  see / decide / do). This is the customer-facing AI-BOM (Pillar 1 inventory),
 *  distinct from the GitHub read-only check that verifies a BOM exists in a repo. */

type Product = { category: string; name: string; services?: string[]; capability?: string };
type Stack = { products?: Product[] } | null | undefined;
type Classify = { patterns?: string[]; see?: string[]; decide?: string[]; do?: string[]; autonomyLevel?: number } | null | undefined;
type UC = { id: string; name: string; description?: string | null; tier?: number | null };

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export interface AiBom {
  bomFormat: "CycloneDX";
  specVersion: "1.6";
  serialNumber: string;
  version: number;
  metadata: Record<string, unknown>;
  components: Record<string, unknown>[];
}

export function buildUseCaseAiBom(uc: UC, stack: Stack, classify: Classify): AiBom {
  const products = stack?.products ?? [];
  const models = products.filter((p) => p.category === "ai_platform");
  const frameworks = products.filter((p) => p.category === "agent_framework");
  const others = products.filter((p) => !["ai_platform", "agent_framework"].includes(p.category));
  const see = classify?.see ?? [];
  const doer = classify?.do ?? [];
  const patterns = classify?.patterns ?? [];

  const components: Record<string, unknown>[] = [];

  for (const m of models) {
    components.push({
      type: "machine-learning-model",
      "bom-ref": `model/${slug(m.name)}`,
      name: m.name,
      description: "AI platform / model used by this use case.",
      modelCard: {
        considerations: {
          useCases: patterns,
          technicalLimitations: [`Autonomy level ${classify?.autonomyLevel ?? 0}/5`],
        },
      },
      ...(m.services && m.services.length ? { properties: [{ name: "services", value: m.services.join("; ") }] } : {}),
    });
  }
  for (const f of frameworks) {
    components.push({ type: "framework", "bom-ref": `framework/${slug(f.name)}`, name: f.name, description: "Agent / orchestration framework." });
  }
  see.forEach((d, i) => {
    components.push({ type: "data", "bom-ref": `data/${i}`, name: d, description: "Data / system the AI can access." });
  });
  for (const o of others) {
    components.push({ type: "library", "bom-ref": `dep/${slug(o.name)}`, name: o.name, description: `${o.category} dependency.` });
  }

  return {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    serialNumber: `urn:uuid:${uc.id}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      component: {
        type: "application",
        "bom-ref": "use-case",
        name: uc.name,
        description: uc.description ?? undefined,
      },
      properties: [
        { name: "neo:risk-tier", value: String(uc.tier ?? "") },
        { name: "neo:patterns", value: patterns.join(", ") },
        { name: "neo:autonomy", value: String(classify?.autonomyLevel ?? "") },
        { name: "neo:actions", value: doer.join("; ") },
      ],
    },
    components,
  };
}
