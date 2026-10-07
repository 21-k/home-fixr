// Local-only test members, created fresh by e2e/auth.setup.ts on every run
// through the local Supabase admin API. They never exist on production.

export type TestUser = {
  key: "junior" | "senior" | "empty" | "newbie";
  email: string;
  password: string;
  handle: string;
  fullName: string;
  role: "junior" | "senior";
  /** Profile fields applied after signup. Omitted for the un-onboarded user. */
  profile?: Record<string, unknown>;
};

const PASSWORD = "e2e-Password-123";

export const USERS: Record<TestUser["key"], TestUser> = {
  junior: {
    key: "junior",
    email: "e2e.junior@homefixr.test",
    password: PASSWORD,
    handle: "e2e_junior",
    fullName: "Jamie Testjunior",
    role: "junior",
    profile: {
      trade: "plumbing",
      region: "Newark, NJ",
      title: "Plumbing apprentice",
      years_experience: 1,
      bio: "Second-year apprentice. Here to learn.",
      display_preference: "handle",
      onboarded_at: "2026-09-01T12:00:00Z",
      username_changed_at: "2026-08-01T12:00:00Z",
    },
  },
  senior: {
    key: "senior",
    email: "e2e.senior@homefixr.test",
    password: PASSWORD,
    handle: "e2e_senior",
    fullName: "Sam Testsenior",
    role: "senior",
    profile: {
      trade: "electrical",
      region: "Edison, NJ",
      title: "Master electrician",
      years_experience: 22,
      bio: "Happy to answer questions about service upgrades.",
      display_preference: "handle",
      mentor_availability: "accepting",
      is_open_to_messages: true,
      is_open_to_ride_alongs: true,
      onboarded_at: "2026-09-01T12:00:00Z",
      username_changed_at: "2026-08-01T12:00:00Z",
    },
  },
  // Onboarded, but never acts in any test: used for empty states.
  empty: {
    key: "empty",
    email: "e2e.empty@homefixr.test",
    password: PASSWORD,
    handle: "e2e_empty",
    fullName: "Erin Testempty",
    role: "junior",
    profile: {
      trade: "hvac",
      region: "Trenton, NJ",
      title: "HVAC student",
      years_experience: 0,
      display_preference: "handle",
      onboarded_at: "2026-09-01T12:00:00Z",
      username_changed_at: "2026-08-01T12:00:00Z",
    },
  },
  // Signed up, never finished /welcome.
  newbie: {
    key: "newbie",
    email: "e2e.newbie@homefixr.test",
    password: PASSWORD,
    handle: "e2e_newbie",
    fullName: "Nico Testnewbie",
    role: "junior",
  },
};

export const storageStatePath = (key: TestUser["key"]) => `e2e/.auth/${key}.json`;
