import { IS_LIVE, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "./env";

/** Read the LOCAL database with the service role, to prove writes landed. */
export async function rest<T = unknown>(path: string): Promise<T> {
  if (IS_LIVE) throw new Error("rest() is local-only");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export async function profileId(handle: string): Promise<string> {
  const rows = await rest<{ id: string }[]>(`profiles?select=id&username=eq.${encodeURIComponent(handle)}`);
  if (!rows[0]) throw new Error(`no profile ${handle}`);
  return rows[0].id;
}
