/**
 * Built-in reference catalogues for the most-requested customer frameworks.
 *
 * When a customer adds a framework by a well-known name (SOC 2, ISO 27001, NIST CSF …) Neo shouldn't
 * have to GUESS the control IDs from memory — that's unreliable. Instead we pass the real control list
 * below to the mapping model so it crosswalks to exact, verifiable references. The customer can still
 * paste their own catalogue to override, and everything remains human-confirmed.
 *
 * These are the public control identifiers/titles only (not the standards' copyrighted text).
 */

export interface Catalogue {
  key: string;
  name: string;         // canonical display name
  authority: string;    // owning body
  match: RegExp;        // matched against the customer's framework name
  catalogue: string;    // id + title, one per line — fed to the mapping model
}

const SOC2 = `SOC 2 Trust Services Criteria (AICPA) — Common Criteria + category criteria:
CC1.1 Demonstrates commitment to integrity and ethical values
CC1.2 Board independence and oversight
CC1.3 Management establishes structures, reporting lines, authorities
CC1.4 Commitment to competence
CC1.5 Enforces accountability
CC2.1 Uses relevant, quality information
CC2.2 Communicates internally
CC2.3 Communicates externally
CC3.1 Specifies objectives to identify and assess risk
CC3.2 Identifies and analyzes risk
CC3.3 Considers potential for fraud
CC3.4 Identifies and assesses changes
CC4.1 Selects and develops ongoing evaluations (monitoring)
CC4.2 Evaluates and communicates deficiencies
CC5.1 Selects and develops control activities
CC5.2 Selects and develops general controls over technology
CC5.3 Deploys control activities through policies and procedures
CC6.1 Logical access security software and infrastructure
CC6.2 Registers and authorizes new users
CC6.3 Manages access rights (add/modify/remove)
CC6.4 Restricts physical access
CC6.5 Discontinues logical/physical protections on disposal
CC6.6 Protects against threats from outside the system boundary
CC6.7 Restricts the transmission/movement of information
CC6.8 Prevents or detects unauthorized/malicious software
CC7.1 Detects and monitors for configuration changes/vulnerabilities
CC7.2 Monitors system components for anomalies
CC7.3 Evaluates security events
CC7.4 Responds to security incidents
CC7.5 Recovers from identified security incidents
CC8.1 Change management: authorizes, designs, develops, tests, approves changes
CC9.1 Risk mitigation for business disruptions
CC9.2 Assesses and manages vendor and business partner risk
A1.1 Availability: capacity management
A1.2 Availability: environmental protections, backup, recovery
A1.3 Availability: recovery plan testing
C1.1 Confidentiality: identifies and maintains confidential information
C1.2 Confidentiality: disposes of confidential information
PI1.1–PI1.5 Processing Integrity: data inputs, processing, outputs
P1–P8 Privacy: notice, choice, collection, use/retention, access, disclosure, quality, monitoring`;

const ISO27001 = `ISO/IEC 27001:2022 Annex A controls (93 controls, 4 themes):
A.5 Organizational controls:
A.5.1 Policies for information security
A.5.7 Threat intelligence
A.5.9 Inventory of information and other associated assets
A.5.10 Acceptable use of information and other associated assets
A.5.12 Classification of information
A.5.14 Information transfer
A.5.15 Access control
A.5.16 Identity management
A.5.17 Authentication information
A.5.18 Access rights
A.5.19 Information security in supplier relationships
A.5.23 Information security for use of cloud services
A.5.24 Information security incident management planning and preparation
A.5.30 ICT readiness for business continuity
A.5.34 Privacy and protection of PII
A.6 People controls:
A.6.1 Screening
A.6.2 Terms and conditions of employment
A.6.3 Information security awareness, education and training
A.7 Physical controls:
A.7.1 Physical security perimeters
A.7.4 Physical security monitoring
A.8 Technological controls:
A.8.1 User endpoint devices
A.8.2 Privileged access rights
A.8.3 Information access restriction
A.8.5 Secure authentication
A.8.8 Management of technical vulnerabilities
A.8.9 Configuration management
A.8.10 Information deletion
A.8.11 Data masking
A.8.12 Data leakage prevention
A.8.15 Logging
A.8.16 Monitoring activities
A.8.20 Networks security
A.8.24 Use of cryptography
A.8.25 Secure development life cycle
A.8.26 Application security requirements
A.8.28 Secure coding
A.8.31 Separation of development, test and production environments
A.8.34 Protection of information systems during audit testing`;

const NIST_CSF2 = `NIST Cybersecurity Framework 2.0 — Functions and Categories:
GV.OC Organizational Context
GV.RM Risk Management Strategy
GV.RR Roles, Responsibilities, and Authorities
GV.PO Policy
GV.OV Oversight
GV.SC Cybersecurity Supply Chain Risk Management
ID.AM Asset Management
ID.RA Risk Assessment
ID.IM Improvement
PR.AA Identity Management, Authentication, and Access Control
PR.AT Awareness and Training
PR.DS Data Security
PR.PS Platform Security
PR.IR Technology Infrastructure Resilience
DE.CM Continuous Monitoring
DE.AE Adverse Event Analysis
RS.MA Incident Management
RS.AN Incident Analysis
RS.CO Incident Response Reporting and Communication
RS.MI Incident Mitigation
RC.RP Incident Recovery Plan Execution
RC.CO Incident Recovery Communication`;

const NIST_80053 = `NIST SP 800-53 Rev.5 control families:
AC Access Control
AT Awareness and Training
AU Audit and Accountability
CA Assessment, Authorization, and Monitoring
CM Configuration Management
CP Contingency Planning
IA Identification and Authentication
IR Incident Response
MA Maintenance
MP Media Protection
PE Physical and Environmental Protection
PL Planning
PM Program Management
PS Personnel Security
PT PII Processing and Transparency
RA Risk Assessment
SA System and Services Acquisition
SC System and Communications Protection
SI System and Information Integrity
SR Supply Chain Risk Management`;

const PCI_DSS4 = `PCI DSS v4.0 — 12 requirements:
Req 1 Install and maintain network security controls
Req 2 Apply secure configurations to all system components
Req 3 Protect stored account data
Req 4 Protect cardholder data with strong cryptography during transmission
Req 5 Protect all systems and networks from malicious software
Req 6 Develop and maintain secure systems and software
Req 7 Restrict access to system components and cardholder data by business need to know
Req 8 Identify users and authenticate access to system components
Req 9 Restrict physical access to cardholder data
Req 10 Log and monitor all access to system components and cardholder data
Req 11 Test security of systems and networks regularly
Req 12 Support information security with organizational policies and programs`;

export const CATALOGUES: Catalogue[] = [
  { key: "soc2", name: "SOC 2 (Trust Services Criteria)", authority: "AICPA", match: /soc\s*-?\s*2|trust services|tsc\b/i, catalogue: SOC2 },
  { key: "iso27001", name: "ISO/IEC 27001:2022", authority: "ISO/IEC", match: /27001|27002|iso\s*270/i, catalogue: ISO27001 },
  { key: "nist_csf", name: "NIST CSF 2.0", authority: "NIST", match: /\bcsf\b|cybersecurity framework/i, catalogue: NIST_CSF2 },
  { key: "nist_80053", name: "NIST SP 800-53 Rev.5", authority: "NIST", match: /800-?53/i, catalogue: NIST_80053 },
  { key: "pci_dss", name: "PCI DSS v4.0", authority: "PCI SSC", match: /pci|dss/i, catalogue: PCI_DSS4 },
];

/** Find a built-in catalogue for a framework whose name matches a well-known standard. */
export function matchCatalogue(name: string): Catalogue | null {
  return CATALOGUES.find((c) => c.match.test(name)) ?? null;
}

/**
 * Broad lookup list for the "add framework" typeahead — the frameworks Neo is likely to recognise and
 * map from its own knowledge. This is NOT an allow-list: a customer can type ANY name (an internal
 * standard, a regulator template) and Neo will still map it, or fall back to a pasted catalogue.
 * `catalogued` marks the ones Neo has a built-in control list for (pinpoint accuracy, no paste needed).
 */
export interface KnownFramework { name: string; authority: string; catalogued?: boolean }

export const KNOWN_FRAMEWORKS: KnownFramework[] = [
  { name: "SOC 2 (Trust Services Criteria)", authority: "AICPA", catalogued: true },
  { name: "SOC 1 (ICFR)", authority: "AICPA" },
  { name: "ISO/IEC 27001:2022", authority: "ISO/IEC", catalogued: true },
  { name: "ISO/IEC 27002:2022", authority: "ISO/IEC" },
  { name: "ISO/IEC 27017 (Cloud)", authority: "ISO/IEC" },
  { name: "ISO/IEC 27018 (PII in cloud)", authority: "ISO/IEC" },
  { name: "ISO/IEC 27701 (Privacy)", authority: "ISO/IEC" },
  { name: "ISO 22301 (Business Continuity)", authority: "ISO" },
  { name: "NIST CSF 2.0", authority: "NIST", catalogued: true },
  { name: "NIST SP 800-53 Rev.5", authority: "NIST", catalogued: true },
  { name: "NIST SP 800-171 Rev.3", authority: "NIST" },
  { name: "PCI DSS v4.0", authority: "PCI SSC", catalogued: true },
  { name: "HITRUST CSF", authority: "HITRUST" },
  { name: "HIPAA Security Rule", authority: "HHS" },
  { name: "FedRAMP", authority: "GSA" },
  { name: "CMMC 2.0", authority: "US DoD" },
  { name: "CIS Critical Security Controls v8", authority: "CIS" },
  { name: "CSA Cloud Controls Matrix (CCM)", authority: "CSA" },
  { name: "COBIT 2019", authority: "ISACA" },
  { name: "SOX ITGC", authority: "SEC / PCAOB" },
  { name: "GDPR", authority: "EU" },
  { name: "CCPA / CPRA", authority: "California" },
  { name: "Essential Eight", authority: "ACSC (Australia)" },
  { name: "Cyber Essentials", authority: "UK NCSC" },
  { name: "APRA CPS 234", authority: "APRA (Australia)" },
  { name: "MAS TRM Guidelines", authority: "MAS (Singapore)" },
  { name: "FFIEC IT Handbook", authority: "FFIEC" },
  { name: "DORA", authority: "EU" },
];
