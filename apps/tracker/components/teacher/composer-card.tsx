import { aiConfigured } from "@/lib/ai/config";
import { TUNING } from "@/lib/domain/tuning";
import { Card } from "../ui";
import { Composer } from "./composer";
import type { DraftScope } from "@/app/actions/ai";

/**
 * The composer in a card, or nothing when AI drafting is off (ADR 0026).
 * Server component: reads the key and the limits, never the model.
 */
export function ComposerCard({ scope, title = "Update from notes or a request", placeholder }: { scope: DraftScope; title?: string; placeholder: string }) {
  if (!aiConfigured()) return null;
  return (
    <Card title={title}>
      <Composer
        scope={scope}
        limits={{ maxFiles: TUNING.aiMaxFiles, maxFileBytes: TUNING.aiMaxFileBytes, imageMaxEdge: TUNING.aiImageMaxEdge }}
        placeholder={placeholder}
      />
    </Card>
  );
}
