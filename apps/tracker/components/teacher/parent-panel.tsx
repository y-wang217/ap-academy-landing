import { inviteParent, removeParentLink, setScheduleRecord } from "@/app/actions/teacher";
import { TRACKER_URL } from "@/lib/config";
import type { ParentLink } from "@/lib/data/schemas";
import { parentInviteText } from "@/lib/view/parent-invite-text";
import { ActionButton, ActionForm } from "../action-form";
import { Card, Empty, Field, inputClass, secondaryButtonClass } from "../ui";

/** Owner only (REQ-22): who may see this student as a parent, and which Students & Parents record they are. */
export function ParentPanel({
  student,
  orgName,
  links,
  names,
}: {
  student: { id: string; firstName: string; notionStudentId: string | null };
  orgName: string;
  links: ParentLink[];
  /** [page id, name][] from Notion, or null when it could not be loaded. */
  names: [string, string][] | null;
}) {
  return (
    <Card title="Parent">
      {links.length === 0 ? (
        <Empty>No parent added yet.</Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {links.map((l) => {
            const text = parentInviteText({ firstName: student.firstName, email: l.email, orgName, trackerUrl: TRACKER_URL });
            return (
              <li key={l.id} className="flex flex-col gap-2 py-3">
                <span className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">{l.email}</span>
                  <span className="text-sm text-text-muted">{l.claimedAt ? "Signed in" : "Invited"}</span>
                </span>
                <span className="flex flex-wrap gap-2">
                  {!l.claimedAt && (
                    <a
                      className={secondaryButtonClass}
                      href={`mailto:${encodeURIComponent(l.email)}?subject=${encodeURIComponent(text.subject)}&body=${encodeURIComponent(text.body)}`}
                    >
                      Open invite email
                    </a>
                  )}
                  <ActionButton
                    action={removeParentLink.bind(null, l.id)}
                    label="Remove"
                    confirm={`Remove ${l.email}? They lose access to ${student.firstName}'s tracker now.`}
                    className={secondaryButtonClass}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <ActionForm action={inviteParent.bind(null, student.id)} labels={{ email: "Parent email" }} secondary submitLabel="Add parent" pendingLabel="Adding..." resetOnSuccess>
        <Field label="Parent email" name="email">
          <input id="email" name="email" type="email" required autoComplete="off" className={inputClass} />
        </Field>
      </ActionForm>
      {names === null ? (
        <p className="text-sm text-text-muted">Could not load the Students &amp; Parents list.</p>
      ) : (
        <ActionForm action={setScheduleRecord.bind(null, student.id)} labels={{ notionStudentId: "Students & Parents record" }} secondary submitLabel="Save record">
          <Field label="Students & Parents record" name="notionStudentId">
            <select id="notionStudentId" name="notionStudentId" defaultValue={student.notionStudentId ?? ""} className={inputClass}>
              <option value="">Not linked</option>
              {names.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
        </ActionForm>
      )}
    </Card>
  );
}
