import { getServiceClient } from "@ap-academy/db/service";
import { createIrisStore } from "@/lib/data/iris";
import { readGmailConfig, readIrisRunEnv } from "@/lib/iris/config";
import { gmailPort } from "@/lib/iris/gmail";
import { handleIrisRun } from "@/lib/iris/handlers";
import { readStudentsConfig } from "@/lib/notion/config";
import { fetchFamilyDirectory } from "@/lib/notion/parents";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The Iris poll (REQ-42, tracker ADR 0056), called every 15 minutes by the
 * iris-poll workflow and by Run now. It authenticates itself with a bearer
 * secret, because the tracker's proxy lets this one path through without a
 * session. The second of exactly two importers of the service-role client: it
 * writes one org's `iris` rows with it, and reads the family directory from
 * Notion once per run.
 */
export async function POST(request: Request) {
  return handleIrisRun({
    authorization: request.headers.get("authorization"),
    env: readIrisRunEnv(),
    build: (orgId) => {
      const client = getServiceClient();
      const gmail = readGmailConfig();
      const students = readStudentsConfig();
      if (!client || !gmail || !students) return null;
      return {
        store: createIrisStore(client.schema("iris"), orgId),
        gmail: gmailPort(gmail),
        directory: () => fetchFamilyDirectory(students),
        mailbox: gmail.mailbox,
      };
    },
  });
}
