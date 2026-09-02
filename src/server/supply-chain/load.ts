export async function loadSupplyChain(_orgId: string, _arg?: unknown, _opts?: { live?: boolean }) {
  return { ledger: { riskGrade: "None" as const, transparency: 0, counts: { total: 0 }, findings: [] as unknown[] } };
}
