import { NextResponse, type NextRequest } from "next/server";
import { getServerClient } from "../../sat/supabase/server";

/** Only same-origin paths, so `next` can't be used as an open redirect. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/sat";
  return value;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  const supabase = await getServerClient();
  if (!supabase || !code) {
    return NextResponse.redirect(`${origin}/sat/login?error=link`);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/sat/login?error=link`);
  }

  // Sync consent on every sign-in so a returning user's latest choice wins —
  // including withdrawing it. The trigger only covers the first sign-up.
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (user) {
    const consented = user.user_metadata?.marketing_consent === true;
    const { data: profile } = await supabase
      .from("profiles")
      .select("marketing_consent, consent_timestamp")
      .eq("id", user.id)
      .maybeSingle();

    // Preserve the original timestamp while consent stays granted; CASL wants
    // the moment it was given, not the moment it was last confirmed.
    const consentTimestamp = consented
      ? (profile?.marketing_consent && profile.consent_timestamp) ||
        new Date().toISOString()
      : null;

    if (
      !profile ||
      profile.marketing_consent !== consented ||
      profile.consent_timestamp !== consentTimestamp
    ) {
      await supabase.from("profiles").upsert(
        {
          id: user.id,
          email: user.email ?? "",
          marketing_consent: consented,
          consent_timestamp: consentTimestamp,
        },
        { onConflict: "id" }
      );
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
