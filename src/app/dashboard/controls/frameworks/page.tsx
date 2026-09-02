import { redirect } from "next/navigation";

/** Framework management now lives under Settings → AI Assessments → Frameworks. */
export default function FrameworksPage() {
  redirect("/dashboard/settings?tab=assessments&sub=frameworks");
}
