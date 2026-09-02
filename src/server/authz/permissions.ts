/**
 * The permission vocabulary. AuthZ answers "may you ask?"; Gravity's gate answers "may it happen?" — two
 * distinct decisions, and this is the first one.
 *
 * Permissions are `domain:action` strings. Capabilities REGISTER their own permissions at import time, so a
 * new Sky capability can extend the model without a migration or a change to this file. Grants support
 * wildcards (`overlay:*`, `*`); checks never do — you always ask for one concrete permission.
 */

export type Permission = string;

export interface PermissionDef {
  key: Permission;
  domain: string;
  label: string;
  description: string;
}

const REGISTRY = new Map<string, PermissionDef>();

/** Register permissions for a domain. Safe to call repeatedly (idempotent by key). */
export function definePermissions(domain: string, defs: { action: string; label: string; description: string }[]): Permission[] {
  return defs.map((d) => {
    const key = `${domain}:${d.action}`;
    REGISTRY.set(key, { key, domain, label: d.label, description: d.description });
    return key;
  });
}

export function allPermissions(): PermissionDef[] {
  return [...REGISTRY.values()].sort((a, b) => a.key.localeCompare(b.key));
}
export function permissionsByDomain(): Record<string, PermissionDef[]> {
  const out: Record<string, PermissionDef[]> = {};
  for (const p of allPermissions()) (out[p.domain] ??= []).push(p);
  return out;
}
export function isKnownPermission(key: string): boolean {
  return REGISTRY.has(key);
}

/**
 * Does a set of GRANTS satisfy a required permission?
 * Grants may be exact ("usecase:read"), domain wildcards ("usecase:*"), or global ("*").
 * Deny by default: an empty grant set satisfies nothing.
 */
export function grantsSatisfy(grants: Iterable<Permission>, required: Permission): boolean {
  const [domain] = required.split(":");
  for (const g of grants) {
    if (g === "*" || g === required) return true;
    if (g.endsWith(":*") && g.slice(0, -2) === domain) return true;
  }
  return false;
}

/** Expand wildcard grants against the registry — used for display ("what does this role actually give?"). */
export function expandGrants(grants: Iterable<Permission>): Permission[] {
  const out = new Set<Permission>();
  const known = allPermissions();
  for (const g of grants) {
    if (g === "*") known.forEach((p) => out.add(p.key));
    else if (g.endsWith(":*")) known.filter((p) => p.domain === g.slice(0, -2)).forEach((p) => out.add(p.key));
    else out.add(g);
  }
  return [...out].sort();
}

/* ------------------------------- core domains ------------------------------- */
/* Capabilities added later call definePermissions() themselves; these are the ones that exist today. */

export const ORG = definePermissions("org", [
  { action: "read", label: "View organization", description: "See organization profile and settings." },
  { action: "manage", label: "Manage organization", description: "Change organization settings, plan, and risk tolerance." },
]);

export const MEMBERS = definePermissions("members", [
  { action: "read", label: "View members", description: "See who belongs to the organization and their roles." },
  { action: "manage", label: "Manage members", description: "Invite, remove, and change the roles of members." },
]);

export const IDENTITY = definePermissions("identity", [
  { action: "read", label: "View identity settings", description: "See SSO configuration and service keys." },
  { action: "manage", label: "Manage identity", description: "Configure SSO, verify domains, issue and revoke service keys." },
]);

export const USECASE = definePermissions("usecase", [
  { action: "read", label: "View use cases", description: "See AI use cases and their assessments." },
  { action: "write", label: "Create and edit use cases", description: "Create use cases and change their content." },
  { action: "delete", label: "Archive use cases", description: "Archive or remove use cases." },
]);

export const OVERLAY = definePermissions("overlay", [
  { action: "read", label: "View overlay", description: "See the tenant overlay on the constitution." },
  { action: "author", label: "Author overlay", description: "Draft changes to the tenant overlay — bending rules within Gravity's limits." },
  { action: "publish", label: "Publish overlay", description: "Compile and activate a new effective constitution for the tenant." },
]);

export const CONTROL = definePermissions("control", [
  { action: "read", label: "View controls", description: "See controls and their coverage." },
  { action: "write", label: "Edit controls", description: "Add, edit, and map controls." },
  { action: "verify", label: "Verify controls", description: "Run live verification against connected systems." },
]);

export const EVIDENCE = definePermissions("evidence", [
  { action: "read", label: "View evidence", description: "See collected evidence and the ledger." },
  { action: "write", label: "Contribute evidence", description: "Attach or attest evidence." },
]);

export const GRAVITY = definePermissions("gravity", [
  { action: "read", label: "Read the constitution", description: "View invariants, rules, decisions, and the evidence ledger." },
  { action: "act", label: "Submit governed actions", description: "Send intents to the decision gate for adjudication." },
  { action: "verify", label: "Run verification", description: "Run the invariant verification suite." },
]);

export const INTEGRATION = definePermissions("integration", [
  { action: "read", label: "View integrations", description: "See connected systems." },
  { action: "manage", label: "Manage integrations", description: "Connect, configure, and disconnect systems." },
]);

export const REPORT = definePermissions("report", [
  { action: "read", label: "View reports", description: "See reports and dashboards." },
  { action: "export", label: "Export reports", description: "Download reports and evidence packs." },
]);
