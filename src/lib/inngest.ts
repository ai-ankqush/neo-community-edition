import { Inngest } from "inngest";

/**
 * Inngest client — durable background execution for the engine. Events are sent
 * from /api/assess and handled by the function in src/server/engine/inngest.ts,
 * served at /api/inngest. In production set INNGEST_EVENT_KEY and
 * INNGEST_SIGNING_KEY; local dev uses the Inngest Dev Server.
 */
// No cloud event key (Community Edition self-host) → talk to the local/self-hosted Inngest
// dev server instead of Inngest Cloud. Production sets INNGEST_EVENT_KEY and uses the cloud.
export const inngest = new Inngest({
  id: "neo-platform",
  isDev: !process.env.INNGEST_EVENT_KEY,
});

/** Event payload for a queued engine stage run. */
export interface EngineStageRequested {
  name: "engine/stage.requested";
  data: {
    jobId: string;
    orgId: string;
    useCaseId: string | null;
    stage: string;
    userId: string;
    input?: Record<string, unknown>;
  };
}
