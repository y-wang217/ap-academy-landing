/** The invite a parent gets, in the ADR 0016 style: a prefilled mailto plus text to copy. */
export function parentInviteText(input: { firstName: string; email: string; orgName: string; trackerUrl: string }) {
  return {
    subject: `${input.firstName}'s student tracker`,
    body: `Hi,\n\nYou can now see ${input.firstName}'s tracker. Open ${input.trackerUrl} and sign in with this email address (${input.email}). We email you a sign-in link, so there is no password.\n\n${input.orgName}`,
  };
}
