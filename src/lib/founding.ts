// Disclosure copy for the Founding Community: the example profiles and early
// discussions the Home Fixr team prepared, with AI assistance, to show how the
// community works. These accounts are not real members, so they never take
// messages, mentorship requests or applications.

/** Shown on a Founding profile, and whenever someone tries to contact one. */
export const FOUNDING_CONTACT_MESSAGE =
  "This is an example profile prepared by the Home Fixr team, with AI assistance, to show how the community works. It isn't a real member, so it can't be messaged and doesn't take mentorship requests or applications.";

/** Shown on a ride-along or collaboration posted from a Founding profile. */
export const FOUNDING_COLLAB_MESSAGE =
  "This is a team-written example posted from a Founding Community profile. It isn't a real opportunity and doesn't take applications.";

export const FOUNDING_ABOUT_SENTENCE =
  "Some early discussions and example profiles were prepared by the Home Fixr team with AI assistance to show how the community works. Those posts are labeled “Team-written example • AI-assisted”, and example profiles carry a Founding Community badge. Founding Community profiles are not real members and can't be messaged.";

/** The label on every post and reply written by the team (see isTeamWritten). */
export const TEAM_WRITTEN_LABEL = "Team-written example • AI-assisted";

/**
 * True for a post, reply or collab the team wrote: its author is a Founding
 * Community profile, or the row came from a seed batch. Pure, so the tests and
 * every surface share one rule.
 */
export function isTeamWritten(
  row: { seed_batch_id?: string | null } | null | undefined,
  author: { is_founding_member?: boolean | null } | null | undefined,
): boolean {
  return Boolean(author?.is_founding_member) || Boolean(row?.seed_batch_id);
}
