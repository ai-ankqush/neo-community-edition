/** Tech catalog for the interactive stack picker. Data-driven: extend
 *  categories/products here, no UI changes needed. Cloud products expand
 *  into service-level selection. */

export interface TechProduct {
  name: string;
  services?: string[]; // service-level picks (clouds)
}

export interface TechCategory {
  key: string;
  label: string;
  products: TechProduct[];
}

export const TECH_CATALOG: TechCategory[] = [
  {
    key: "cloud",
    label: "Cloud Platform",
    products: [
      {
        name: "AWS",
        services: [
          "CloudTrail", "CloudWatch", "GuardDuty", "Security Hub", "Config",
          "IAM Identity Center", "KMS", "S3", "EKS", "Lambda", "Bedrock",
          "Secrets Manager", "Macie", "VPC", "API Gateway",
        ],
      },
      {
        name: "Azure",
        services: [
          "Activity Log", "Azure Monitor", "Defender for Cloud", "Azure Policy",
          "Key Vault", "AKS", "Functions", "Azure OpenAI", "AI Search",
          "Private Link", "Purview", "Application Insights", "API Management",
        ],
      },
      {
        name: "GCP",
        services: [
          "Cloud Audit Logs", "Cloud Logging", "Security Command Center",
          "Cloud KMS", "GKE", "Cloud Functions", "Vertex AI", "Secret Manager",
          "VPC Service Controls", "DLP API", "Apigee",
        ],
      },
      { name: "Oracle Cloud" },
      { name: "On-premises" },
    ],
  },
  {
    key: "ai_platform",
    label: "AI Platform / Models",
    products: [
      { name: "Azure OpenAI" }, { name: "AWS Bedrock" }, { name: "GCP Vertex AI" },
      { name: "OpenAI API" }, { name: "Anthropic API" }, { name: "Self-hosted LLM" },
      { name: "Hugging Face" }, { name: "Databricks Mosaic" },
    ],
  },
  {
    key: "agent_framework",
    label: "Agent Framework",
    products: [
      { name: "LangChain" }, { name: "LangGraph" }, { name: "AutoGen" },
      { name: "CrewAI" }, { name: "Semantic Kernel" }, { name: "Custom-built" },
    ],
  },
  {
    key: "identity",
    label: "Identity & Access",
    products: [
      { name: "Okta", services: ["Single Sign-On", "Adaptive MFA", "Lifecycle Management", "API Access Management (OAuth/OIDC)", "Identity Governance (OIG)", "Privileged Access"] },
      { name: "Microsoft Entra ID", services: ["Single Sign-On", "Multi-Factor Authentication", "Conditional Access", "Identity Protection", "Privileged Identity Management (PIM)", "ID Governance / access reviews", "App registrations & enterprise apps"] },
      { name: "Ping Identity" },
      { name: "Google Workspace", services: ["SSO / directory", "2-Step Verification", "Context-Aware Access", "DLP for Drive/Gmail", "Admin audit logs"] },
      { name: "CyberArk" }, { name: "SailPoint" },
      { name: "HashiCorp Vault" },
    ],
  },
  {
    key: "edr",
    label: "Endpoint, Identity & XDR",
    products: [
      { name: "CrowdStrike", services: ["Falcon Endpoint / EDR", "Falcon Identity Protection (ITDR)", "Falcon Cloud Security (CSPM/CWP)", "Falcon Next-Gen SIEM / LogScale", "Falcon Exposure Management", "Falcon Discover (asset inventory)"] },
      { name: "SentinelOne", services: ["Singularity Endpoint (EDR/XDR)", "Singularity Identity", "Singularity Cloud Security", "Singularity Data Lake (SIEM)"] },
      { name: "Microsoft Defender", services: ["Defender for Endpoint", "Defender for Identity", "Defender for Cloud (CSPM/CWP)", "Defender for Cloud Apps (CASB)", "Defender for Office 365", "Defender XDR (unified)"] },
      { name: "Palo Alto Cortex", services: ["Cortex XDR (endpoint)", "Cortex XSIAM (SIEM)", "Cortex XSOAR (SOAR)", "Cortex Xpanse (attack surface)"] },
    ],
  },
  {
    key: "siem",
    label: "SIEM & Logging",
    products: [
      { name: "Splunk", services: ["Enterprise Security (SIEM)", "SOAR", "Observability / ITSI", "Core / log search"] },
      { name: "Microsoft Sentinel" }, { name: "Datadog", services: ["Cloud SIEM", "Cloud Security Management", "Log Management", "APM / Observability"] },
      { name: "Elastic Security" }, { name: "Google Chronicle" },
      { name: "Sumo Logic" }, { name: "QRadar" },
    ],
  },
  {
    key: "itsm",
    label: "ITSM & Ticketing",
    products: [
      { name: "ServiceNow", services: ["ITSM (incident / request)", "Change Management", "Security Incident Response (SIR)", "Vulnerability Response (VR)", "GRC / IRM"] },
      { name: "Jira" }, { name: "Zendesk" },
      { name: "Freshservice" },
    ],
  },
  {
    key: "network",
    label: "Network & Edge Security",
    products: [
      { name: "Zscaler", services: ["Internet Access (ZIA / SWG)", "Private Access (ZPA / ZTNA)", "Posture Control (CNAPP)", "Data Protection (DLP)"] },
      { name: "Netskope", services: ["Next-Gen SWG", "CASB", "Private Access (ZTNA)", "Data Loss Prevention (DLP)"] },
      { name: "Palo Alto NGFW", services: ["Threat Prevention / IPS", "URL Filtering", "WildFire (sandboxing)", "Prisma Access (SASE)", "DNS Security"] },
      { name: "Cloudflare", services: ["WAF", "Zero Trust (Access / Gateway)", "DDoS Protection", "DNS", "API Shield"] },
      { name: "Fortinet" },
    ],
  },
  {
    key: "iac_cicd",
    label: "IaC & CI/CD",
    products: [
      { name: "Terraform" }, { name: "Pulumi" }, { name: "GitHub Actions" },
      { name: "GitLab CI" }, { name: "Jenkins" }, { name: "Azure Pipelines" },
    ],
  },
  {
    key: "code",
    label: "Code & Repos",
    products: [
      { name: "GitHub" }, { name: "GitLab" }, { name: "Bitbucket" },
      { name: "Azure DevOps" },
    ],
  },
  {
    key: "data",
    label: "Data Platforms",
    products: [
      { name: "Snowflake" }, { name: "Databricks" }, { name: "SharePoint" },
      { name: "Salesforce" }, { name: "MongoDB Atlas" }, { name: "PostgreSQL" },
    ],
  },
  {
    key: "grc",
    label: "GRC & Compliance",
    products: [
      { name: "ServiceNow GRC" }, { name: "Archer" }, { name: "Vanta" },
      { name: "Drata" }, { name: "OneTrust" },
    ],
  },
];

export interface StackSelection {
  products: { category: string; name: string; services?: string[]; capability?: string }[];
  other?: string;
}

/** Capability domains a user assigns to an off-catalog ("custom") product so
 *  controls still map to the right pillar set. Keys mirror catalog categories. */
export const CUSTOM_CAPABILITIES: { key: string; label: string }[] = [
  { key: "identity", label: "Identity & Access" },
  { key: "edr", label: "Endpoint / EDR / XDR" },
  { key: "siem", label: "SIEM / Logging / Monitoring" },
  { key: "cloud", label: "Cloud Platform" },
  { key: "data", label: "Data Platform / Storage" },
  { key: "network", label: "Network / Edge / SASE" },
  { key: "ai_platform", label: "AI Platform / Model" },
  { key: "agent_framework", label: "Agent Framework" },
  { key: "itsm", label: "ITSM / Workflow" },
  { key: "grc", label: "GRC / Compliance" },
  { key: "code", label: "Code / CI-CD" },
  { key: "other", label: "Other / Internal tool" },
];

/** Count toward the plan's tech product limit (cloud services are free detail). */
export function productCount(stack: StackSelection | null | undefined): number {
  return stack?.products?.length ?? 0;
}

/** Every catalog product name, for matching a control's text to the tech it configures. */
export const ALL_TECH_NAMES: string[] = TECH_CATALOG.flatMap((c) => c.products.map((p) => p.name));

// Legal / review / attestation controls aren't "configured in a tool" — they merely *mention*
// systems as the subject of a review. Don't show a tech for these (a memo/DPA/legal review that
// lists Okta is not "configured in Okta"). NB: deliberately excludes bare "policy"/"document" —
// those appear in real config controls (IAM policy, etc.).
const PROCESS_CONTROL =
  /\bdpa\b|data processing agreement|legal review|regulatory review|legal\/regulatory|legal counsel|engage legal|review memo|attestation\b|sign[- ]?off|risk acceptance|accept(ed)? (the )?risk|inventory record|named (business )?owner|business owner|data classification|risk tier|awareness training|roles and responsibilit/;

/** The technology a control is CONFIGURED on: the declared-stack product(s) the control names
 *  (preferred), else any catalog product it names. This is "where you implement it", independent
 *  of whether Neo can verify it (verification is a separate, evidence-side concern). Legal/process
 *  controls return [] — they aren't configured in a tool. */
export function techForControl(text: string, stack: StackSelection | null | undefined): string[] {
  const t = (text ?? "").toLowerCase();
  if (PROCESS_CONTROL.test(t)) return [];
  const declared = (stack?.products ?? []).map((p) => p.name);
  // Candidates = the customer's declared products PLUS the catalog, so a tech named in the
  // generated how-to resolves even if it wasn't ticked in the picker (e.g. Zscaler/Drata).
  const candidates = [...new Set([...declared, ...ALL_TECH_NAMES])];
  const hits: { n: string; i: number }[] = [];
  for (const n of candidates) {
    if (!n || n.length <= 2) continue;
    const i = t.indexOf(n.toLowerCase());
    if (i >= 0) hits.push({ n, i });
  }
  // Order by FIRST appearance: the primary "configure-in" tech is the admin console/portal the
  // action opens in — never an incidental mention ("scope to the group synced from Okta"). So the
  // lead tech is where you actually do the work, and grouping/evidence follow the real owner.
  hits.sort((a, b) => a.i - b.i);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const h of hits) if (!seen.has(h.n)) { seen.add(h.n); out.push(h.n); }
  return out;
}
