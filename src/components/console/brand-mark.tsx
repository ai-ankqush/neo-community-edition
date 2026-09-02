"use client";

import { useState } from "react";

// Maps a provider id to a Simple Icons slug. null = no reliable monochrome mark
// (big-vendor trademarks aren't on the free icon CDN) → fall back to a lettermark.
const SLUG: Record<string, string | null> = {
  github: "github",
  aws: null,
  gcp: "googlecloud",
  azure: null,
  okta: "okta",
  entra: null,
  google_workspace: "googleworkspace",
  servicenow: "servicenow",
  jira: "jira",
  splunk: "splunk",
  openai: "openai",
  anthropic: "anthropic",
  langsmith: "langchain",
  vault: "vault",
  snowflake: "snowflake",
  databricks: "databricks",
  purview: null,
  datadog: "datadog",
};

const MARK: Record<string, string> = {
  aws: "AWS",
  azure: "Az",
  entra: "EN",
  google_workspace: "GW",
  langsmith: "LS",
  vault: "HV",
  purview: "MP",
};

/** Monochrome vendor logo with a graceful lettermark fallback. */
export function BrandMark({ id, name, accent }: { id: string; name: string; accent: string }) {
  const [err, setErr] = useState(false);
  const slug = SLUG[id];
  const mark = MARK[id] ?? name[0];

  if (!slug || err) {
    return (
      <span
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
        style={{ background: accent }}
      >
        {mark}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://cdn.simpleicons.org/${slug}/8fa3bf`}
      alt=""
      width={26}
      height={26}
      loading="lazy"
      onError={() => setErr(true)}
      className="h-[26px] w-[26px] flex-shrink-0"
    />
  );
}
