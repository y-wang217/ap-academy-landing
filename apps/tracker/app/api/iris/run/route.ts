import { getServiceClient } from "@ap-academy/db/service";
import { aiConfigured } from "@/lib/ai/config";
import { createIrisStore } from "@/lib/data/iris";
import { classifyMessage } from "@/lib/iris/classify";
import { readCharlieUserId, readGmailConfig, readIrisRunEnv } from "@/lib/iris/config";
import { draftReply } from "@/lib/iris/draft";
import { gmailPort } from "@/lib/iris/gmail";
import { handleIrisRun } from "@/lib/iris/handlers";
import { runPush } from "@/lib/iris/notion-push";
import { readStudentsConfig, readWorkConfig } from "@/lib/notion/config";
import { SITE_URL } from "@/lib/config";
import { fetchFamilyDirectory } from "@/lib/notion/parents";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * The Iris poll (REQ-42, tracker ADR 0057), called every 15 minutes by the
 * iris-poll workflow and by Run now. It authenticates itself with a bearer
 * secret, because the tracker's proxy lets this one path through without a
 * session. The second of exactly two importers of the service-role client: it
 * writes one org's `iris` rows with it, and reads the family directory from
 * Notion once per run. With ANTHROPIC_API_KEY set it then classifies matched
 * mail with Claude (REQ-43) and drafts replies (REQ-44); with Notion Work set
 * up it pushes the phone copies to Charlie's day page.
 */
export async function POST(request: Request) {
  return handleIrisRun({
    authorization: request.headers.get("authorization"),
    env: readIrisRunEnv(),
    build: (orgId) => {
      const client = getServiceClient();
      const gmail = readGmailConfig();
      const students = readStudentsConfig();
      const work = readWorkConfig();
      if (!client || !gmail || !students) return null;
      return {
        store: createIrisStore(client.schema("iris"), orgId),
        gmail: gmailPort(gmail),
        directory: () => fetchFamilyDirectory(students),
        mailbox: gmail.mailbox,
        classify: aiConfigured() ? classifyMessage : null,
        draft: aiConfigured() ? draftReply : null,
        push: work
          ? ({ store, directory, now }) =>
              runPush({ store, config: work, charlieUserId: readCharlieUserId(), siteUrl: SITE_URL, mailbox: gmail.mailbox, directory, now })
          : null,
      };
    },
  });
}
