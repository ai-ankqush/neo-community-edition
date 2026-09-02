/** Returns the URL only if it is a well-formed http(s) link, else null.
 *  Guards against javascript:, data:, vbscript:, etc. in user-supplied URLs
 *  rendered as <a href>. Use everywhere a user/vendor-provided URL is linked. */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(String(raw).trim());
    if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
    return null;
  } catch {
    return null;
  }
}
