import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";
import { engineRunStage, engineArtifacts, engineRedTeam } from "@/server/engine/inngest";

// Each Inngest step is its own invocation; give them the full window so a
// single stage call comfortably completes within one step.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [engineRunStage, engineArtifacts, engineRedTeam],
});
