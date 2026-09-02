/** Deterministic pillar -> framework crosswalk fallback.
 *  Applied when the engine leaves a framework ref blank or "n/a", so the
 *  crosswalk view is never empty. Maps by control PILLAR (control function),
 *  which is the conceptual basis for the mapping. */

interface Refs {
  nist_ai_rmf: string;
  iso_42001: string;
  eu_ai_act: string;
  owasp_llm: string;
  sr_11_7: string;
  nydfs_500: string;
}

// SR 11-7 element per pillar (US model risk management) and NYDFS Part 500 section
// per pillar (AI-through-cyber). See the public mappings/sr-11-7-crosswalk.md and
// mappings/nydfs-part-500-crosswalk.md.
const PILLAR_FALLBACK: Record<number, Refs> = {
  1: { nist_ai_rmf: "MAP 1.1; GOVERN 1.2", iso_42001: "A.4.2; A.6.2", eu_ai_act: "Art. 9; Art. 11", owasp_llm: "n/a", sr_11_7: "Governance & controls (model inventory)", nydfs_500: "500.13 asset inventory; 500.9 risk assessment" },
  2: { nist_ai_rmf: "GOVERN 1.1; MANAGE 2.3", iso_42001: "A.5.2; A.9.2", eu_ai_act: "Art. 15", owasp_llm: "LLM06 Excessive Agency", sr_11_7: "Governance & controls (controls over use)", nydfs_500: "500.7 access; 500.12 MFA" },
  3: { nist_ai_rmf: "MAP 3.4; MEASURE 2.6", iso_42001: "A.7.4; A.8.3", eu_ai_act: "Art. 10", owasp_llm: "LLM02 Sensitive Information Disclosure", sr_11_7: "Development, implementation & use (data)", nydfs_500: "500.13 data; 500.3 NPI protection" },
  4: { nist_ai_rmf: "MEASURE 2.7; MANAGE 2.3", iso_42001: "A.8.2", eu_ai_act: "Art. 15", owasp_llm: "LLM01 Prompt Injection", sr_11_7: "Development, implementation & use (inputs)", nydfs_500: "500.14 social engineering" },
  5: { nist_ai_rmf: "MEASURE 2.3; MANAGE 1.3", iso_42001: "A.8.4", eu_ai_act: "Art. 13; Art. 14", owasp_llm: "LLM09 Misinformation", sr_11_7: "Validation & effective challenge (outputs)", nydfs_500: "500.14 monitoring" },
  6: { nist_ai_rmf: "MANAGE 2.3; MEASURE 2.6", iso_42001: "A.9.2", eu_ai_act: "Art. 14; Art. 15", owasp_llm: "LLM06 Excessive Agency", sr_11_7: "Development, implementation & use (controls over use)", nydfs_500: "500.7 access to actions" },
  7: { nist_ai_rmf: "GOVERN 2.1; GOVERN 3.2", iso_42001: "A.3.2; A.9.2", eu_ai_act: "Art. 14; Art. 26", owasp_llm: "n/a", sr_11_7: "Governance & controls (roles & independence)", nydfs_500: "500.4 CISO governance" },
  8: { nist_ai_rmf: "MEASURE 2.1; MEASURE 2.5", iso_42001: "A.6.2; A.8.5", eu_ai_act: "Art. 15; Art. 9", owasp_llm: "LLM04 Data and Model Poisoning", sr_11_7: "Validation & effective challenge", nydfs_500: "500.5 pen testing" },
  9: { nist_ai_rmf: "MEASURE 2.4; MANAGE 4.1", iso_42001: "A.8.5; A.9.3", eu_ai_act: "Art. 12; Art. 72", owasp_llm: "n/a", sr_11_7: "Validation & effective challenge (ongoing monitoring)", nydfs_500: "500.14 monitoring; 500.06 audit trail" },
  10: { nist_ai_rmf: "MANAGE 4.1; MANAGE 2.4", iso_42001: "A.10.2", eu_ai_act: "Art. 73; Art. 9", owasp_llm: "LLM10 Unbounded Consumption", sr_11_7: "Governance & controls (model failure response)", nydfs_500: "500.16 incident; 500.17 notification" },
};

const blank = (v: unknown) =>
  v == null || String(v).trim() === "" || String(v).trim().toLowerCase() === "n/a";

/** Merge model-provided refs with the pillar fallback; model wins when present. */
export function withFrameworkFallback(
  pillar: number,
  refs: Partial<Refs> | null | undefined
): Refs {
  const fb = PILLAR_FALLBACK[pillar] ?? { nist_ai_rmf: "n/a", iso_42001: "n/a", eu_ai_act: "n/a", owasp_llm: "n/a", sr_11_7: "n/a", nydfs_500: "n/a" };
  return {
    nist_ai_rmf: blank(refs?.nist_ai_rmf) ? fb.nist_ai_rmf : String(refs!.nist_ai_rmf),
    iso_42001: blank(refs?.iso_42001) ? fb.iso_42001 : String(refs!.iso_42001),
    eu_ai_act: blank(refs?.eu_ai_act) ? fb.eu_ai_act : String(refs!.eu_ai_act),
    owasp_llm: blank(refs?.owasp_llm) ? fb.owasp_llm : String(refs!.owasp_llm),
    sr_11_7: blank(refs?.sr_11_7) ? fb.sr_11_7 : String(refs!.sr_11_7),
    nydfs_500: blank(refs?.nydfs_500) ? fb.nydfs_500 : String(refs!.nydfs_500),
  };
}
