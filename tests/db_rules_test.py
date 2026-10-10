# /// script
# requires-python = ">=3.10"
# dependencies = ["psycopg[binary]>=3.1"]
# ///
"""
Database rule checks for migrations 0009/0010, run against the LOCAL Supabase
stack only. Every case runs inside a transaction that is rolled back, so the
database is left exactly as it was.

    uv run tests/db_rules_test.py            # default local DB URL
    DB_URL=postgresql://... uv run tests/db_rules_test.py

API behaviour is simulated the way PostgREST does it: `set local role
authenticated` plus a `request.jwt.claims` setting, so RLS policies and the
role-sensitive triggers see exactly what a signed-in browser would.
"""
from __future__ import annotations

import json
import os
import sys
import uuid
from urllib.parse import urlparse

import psycopg

DB_URL = os.environ.get("DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")
if urlparse(DB_URL).hostname not in ("127.0.0.1", "localhost"):
    sys.exit("refusing to run DB tests against a non-local database")

RESULTS: list[tuple[str, bool, str]] = []


def case(fn):
    name = fn.__name__
    with psycopg.connect(DB_URL, autocommit=False) as conn:
        try:
            fn(conn)
            RESULTS.append((name, True, ""))
        except AssertionError as e:
            RESULTS.append((name, False, str(e)))
        except Exception as e:  # unexpected error = failure
            RESULTS.append((name, False, f"{type(e).__name__}: {e}"))
        finally:
            conn.rollback()
    return fn


def make_user(cur, email: str, meta: dict | None = None) -> str:
    uid = str(uuid.uuid4())
    cur.execute(
        """insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
           values (%s, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', %s, %s, now(), now())""",
        (uid, email, json.dumps(meta or {})),
    )
    return uid


def as_user(cur, uid: str):
    cur.execute("set local role authenticated")
    cur.execute(
        "select set_config('request.jwt.claims', %s, true)",
        (json.dumps({"sub": uid, "role": "authenticated"}),),
    )


def as_staff(cur):
    cur.execute("reset role")


def expect_error(cur, sql: str, params=(), contains: str = ""):
    cur.execute("savepoint s")
    try:
        cur.execute(sql, params)
    except psycopg.Error as e:
        cur.execute("rollback to savepoint s")
        msg = f"{e.diag.message_primary} {e.diag.message_hint or ''}"
        assert contains.lower() in msg.lower(), f"expected error containing {contains!r}, got {msg!r}"
        return
    cur.execute("rollback to savepoint s")
    raise AssertionError(f"expected an error ({contains}) but statement succeeded: {sql}")


def username_of(cur, uid: str) -> str:
    cur.execute("select username from profiles where id = %s", (uid,))
    return cur.fetchone()[0]


# --------------------------------------------------------------------------
@case
def signup_derives_valid_handle_from_awkward_emails(conn):
    cur = conn.cursor()
    a = make_user(cur, "john-doe.smith@example.test")
    assert username_of(cur, a) == "john_doe.smith", username_of(cur, a)
    b = make_user(cur, "ab@example.test")
    assert username_of(cur, b).startswith("member"), username_of(cur, b)
    c = make_user(cur, "admin@example.test")
    assert username_of(cur, c).startswith("member"), "reserved local part must not become a handle"
    d = make_user(cur, "averyveryverylongemaillocalpart@example.test")
    assert len(username_of(cur, d)) <= 22
    e = make_user(cur, "John-Doe.Smith@other.test")
    assert username_of(cur, e).lower() != username_of(cur, a).lower(), "case-insensitive dedupe on signup"


@case
def signup_keeps_explicit_metadata_handle_casing(conn):
    cur = conn.cursor()
    u = make_user(cur, "x1@example.test", {"username": "RaritanTestSparky", "full_name": "Test Person"})
    assert username_of(cur, u) == "RaritanTestSparky"


@case
def api_user_cannot_pick_invalid_handle(conn):
    cur = conn.cursor()
    u = make_user(cur, "fmt@example.test")
    as_user(cur, u)
    for bad, why in [("ab", "too_short"), ("a" * 23, "too_long"), ("bad-dash", "bad_chars"),
                     (".lead", "dot_edge"), ("trail.", "dot_edge"), ("sp ace", "bad_chars")]:
        expect_error(cur, "update profiles set username = %s where id = %s", (bad, u), why)


@case
def api_user_cannot_take_handle_differing_only_by_case(conn):
    cur = conn.cursor()
    a = make_user(cur, "case1@example.test", {"username": "ShorePipesTest"})
    b = make_user(cur, "case2@example.test")
    as_user(cur, b)
    expect_error(cur, "update profiles set username = 'shorepipestest' where id = %s", (b,), "taken")
    cur.execute("select check_handle('SHOREPIPESTEST')")
    assert cur.fetchone()[0] == "taken"


@case
def reserved_handles_blocked_for_api_but_staff_can_assign(conn):
    cur = conn.cursor()
    u = make_user(cur, "res@example.test")
    as_user(cur, u)
    for bad in ["admin", "HomeFixr_Team", "IBEW_Local_102", "ualocal9", "Support", "lincolntech"]:
        expect_error(cur, "update profiles set username = %s where id = %s", (bad, u), "reserved")
    cur.execute("select check_handle('ibew.local.102')")
    assert cur.fetchone()[0] == "reserved"
    as_staff(cur)
    cur.execute("update profiles set username = 'HomeFixr_Team' where id = %s", (u,))


@case
def handle_change_is_rate_limited_to_once_per_30_days(conn):
    cur = conn.cursor()
    u = make_user(cur, "rate@example.test")
    as_user(cur, u)
    cur.execute("update profiles set username = 'FirstPickTest' where id = %s", (u,))
    cur.execute("select username_changed_at is not null from profiles where id = %s", (u,))
    assert cur.fetchone()[0], "first change must stamp username_changed_at"
    expect_error(cur, "update profiles set username = 'SecondPickTest' where id = %s", (u,), "30 days")
    # tampering with the clock is ignored
    cur.execute("update profiles set username_changed_at = now() - interval '60 days' where id = %s", (u,))
    expect_error(cur, "update profiles set username = 'SecondPickTest' where id = %s", (u,), "30 days")
    as_staff(cur)
    cur.execute("update profiles set username_changed_at = now() - interval '31 days' where id = %s", (u,))
    as_user(cur, u)
    cur.execute("update profiles set username = 'SecondPickTest' where id = %s", (u,))


@case
def api_user_cannot_flip_founding_flags(conn):
    cur = conn.cursor()
    u = make_user(cur, "flag@example.test")
    as_user(cur, u)
    expect_error(cur, "update profiles set is_founding_member = true where id = %s", (u,), "staff")
    expect_error(cur, "update profiles set seed_batch_id = 'x' where id = %s", (u,), "staff")


@case
def legacy_username_that_breaks_new_rules_can_still_edit_profile(conn):
    cur = conn.cursor()
    u = make_user(cur, "legacy@example.test")
    as_staff(cur)
    # simulate a pre-0009 row: bypass the guard the way old data would exist
    cur.execute("alter table profiles disable trigger profiles_guard")
    cur.execute("update profiles set username = 'legacy-user-with-dash' where id = %s", (u,))
    cur.execute("alter table profiles enable trigger profiles_guard")
    as_user(cur, u)
    cur.execute("update profiles set bio = 'still works' where id = %s", (u,))
    cur.execute("select bio from profiles where id = %s", (u,))
    assert cur.fetchone()[0] == "still works"


def founding_pair(cur):
    real = make_user(cur, "real@example.test")
    fm = make_user(cur, "fm@founding.invalid", {"username": "FoundingTestSenior", "role": "senior"})
    cur.execute("update profiles set is_founding_member = true, role = 'senior', mentor_availability = 'limited' where id = %s", (fm,))
    return real, fm


@case
def real_member_cannot_message_founding_account(conn):
    cur = conn.cursor()
    real, fm = founding_pair(cur)
    as_user(cur, real)
    expect_error(cur, "insert into messages (sender_id, recipient_id, body) values (%s, %s, 'hi')", (real, fm), "Founding Community")


@case
def real_member_cannot_request_founding_mentor(conn):
    cur = conn.cursor()
    real, fm = founding_pair(cur)
    as_user(cur, real)
    expect_error(cur, "insert into mentorships (junior_id, senior_id) values (%s, %s)", (real, fm), "Founding Community")


@case
def real_member_cannot_apply_to_founding_collab(conn):
    cur = conn.cursor()
    real, fm = founding_pair(cur)
    cur.execute("insert into job_collabs (poster_id, type, title, body) values (%s, 'ride_along', 't', 'b') returning id", (fm,))
    cid = cur.fetchone()[0]
    as_user(cur, real)
    expect_error(cur, "insert into collab_interests (collab_id, user_id, note) values (%s, %s, 'me')", (cid, real), "Founding Community")


@case
def mentor_not_accepting_blocks_requests_but_accepting_allows(conn):
    cur = conn.cursor()
    jr = make_user(cur, "jr@example.test")
    sr = make_user(cur, "sr@example.test", {"role": "senior"})
    cur.execute("update profiles set mentor_availability = 'not_accepting' where id = %s", (sr,))
    as_user(cur, jr)
    expect_error(cur, "insert into mentorships (junior_id, senior_id) values (%s, %s)", (jr, sr), "isn't taking")
    as_staff(cur)
    cur.execute("update profiles set mentor_availability = 'accepting' where id = %s", (sr,))
    as_user(cur, jr)
    cur.execute("insert into mentorships (junior_id, senior_id) values (%s, %s)", (jr, sr))


@case
def real_members_can_still_message_each_other(conn):
    cur = conn.cursor()
    a = make_user(cur, "a@example.test")
    b = make_user(cur, "b@example.test")
    as_user(cur, a)
    cur.execute("insert into messages (sender_id, recipient_id, body) values (%s, %s, 'hello')", (a, b))


@case
def seeding_flag_suppresses_notifications_and_only_then(conn):
    cur = conn.cursor()
    a = make_user(cur, "n1@example.test")
    b = make_user(cur, "n2@example.test")
    cur.execute("select count(*) from notifications")
    before = cur.fetchone()[0]
    cur.execute("set local homefixr.seeding = 'on'")
    cur.execute("insert into follows (follower_id, following_id) values (%s, %s)", (a, b))
    cur.execute("insert into posts (author_id, type, title, body) values (%s, 'question', 'q', 'b') returning id", (a,))
    pid = cur.fetchone()[0]
    cur.execute("insert into replies (post_id, author_id, body) values (%s, %s, 'r')", (pid, b))
    cur.execute("select count(*) from notifications")
    assert cur.fetchone()[0] == before, "notifications created while seeding flag on"
    cur.execute("select reply_count, slug is not null from posts where id = %s", (pid,))
    rc, has_slug = cur.fetchone()
    assert rc == 1 and has_slug, "counter/slug triggers must still run while seeding"
    cur.execute("set local homefixr.seeding = 'off'")
    cur.execute("insert into follows (follower_id, following_id) values (%s, %s)", (b, a))
    cur.execute("select count(*) from notifications")
    assert cur.fetchone()[0] == before + 1, "notifications must work normally without the flag"


@case
def api_user_cannot_set_seeding_flag_through_rls_path(conn):
    # The flag is a GUC; PostgREST never issues SET. This asserts the flag is
    # transaction-local so it can't leak to the next request on a pooled conn.
    cur = conn.cursor()
    cur.execute("set local homefixr.seeding = 'on'")
    conn.commit()
    cur.execute("select seeding_in_progress()")
    assert cur.fetchone()[0] is False


@case
def member_can_set_own_avatar_within_the_allowed_set(conn):
    cur = conn.cursor()
    u = make_user(cur, "av@example.test")
    other = make_user(cur, "av2@example.test")
    as_user(cur, u)
    cur.execute("update profiles set avatar_style = 'icon', avatar_icon = 'wrench' where id = %s", (u,))
    cur.execute("update profiles set avatar_style = 'none', avatar_icon = null where id = %s", (u,))
    cur.execute("select avatar_style from profiles where id = %s", (u,))
    assert cur.fetchone()[0] == "none"
    expect_error(cur, "update profiles set avatar_style = 'icon', avatar_icon = null where id = %s", (u,), "avatar_icon_required")
    expect_error(cur, "update profiles set avatar_style = 'icon', avatar_icon = 'skull' where id = %s", (u,), "avatar_icon_valid")
    expect_error(cur, "update profiles set avatar_style = 'photo' where id = %s", (u,), "avatar_style_valid")
    expect_error(cur, "update profiles set avatar_style = 'none', is_founding_member = true where id = %s", (u,), "staff")
    # RLS: someone else's row is untouched (0 rows updated, no error).
    cur.execute("update profiles set avatar_style = 'none' where id = %s", (other,))
    assert cur.rowcount == 0


# ---------------------------------------------------------------- 0013 filled
def real_collab(cur, poster_email="poster@example.test"):
    poster = make_user(cur, poster_email)
    cur.execute("insert into job_collabs (poster_id, type, title, body) values (%s, 'extra_hand', 't', 'b') returning id", (poster,))
    return poster, cur.fetchone()[0]


@case
def poster_can_mark_own_collab_filled_and_reopen_it(conn):
    cur = conn.cursor()
    poster, cid = real_collab(cur)
    other = make_user(cur, "notposter@example.test")
    as_user(cur, poster)
    cur.execute("update job_collabs set filled_at = now() where id = %s", (cid,))
    assert cur.rowcount == 1, "poster must be able to mark their own collab filled"
    cur.execute("select filled_at is not null from job_collabs where id = %s", (cid,))
    assert cur.fetchone()[0]
    cur.execute("update job_collabs set filled_at = null where id = %s", (cid,))
    cur.execute("select filled_at from job_collabs where id = %s", (cid,))
    assert cur.fetchone()[0] is None, "poster must be able to reopen"
    as_user(cur, other)
    cur.execute("update job_collabs set filled_at = now() where id = %s", (cid,))
    assert cur.rowcount == 0, "only the poster can mark a collab filled (RLS)"


@case
def api_filled_at_is_stamped_now_not_backdated(conn):
    cur = conn.cursor()
    poster, cid = real_collab(cur)
    as_user(cur, poster)
    cur.execute("update job_collabs set filled_at = '2001-01-01' where id = %s", (cid,))
    cur.execute("select filled_at > now() - interval '1 minute' from job_collabs where id = %s", (cid,))
    assert cur.fetchone()[0], "an API user's filled_at must be the time they marked it"
    expect_error(cur, "update job_collabs set seed_batch_id = 'x' where id = %s", (cid,), "staff")


@case
def real_member_cannot_apply_to_filled_collab(conn):
    cur = conn.cursor()
    poster, cid = real_collab(cur)
    jr = make_user(cur, "applicant@example.test")
    as_staff(cur)
    cur.execute("update job_collabs set filled_at = now() where id = %s", (cid,))
    as_user(cur, jr)
    expect_error(cur, "insert into collab_interests (collab_id, user_id, note) values (%s, %s, 'me')", (cid, jr), "filled")
    expect_error(cur, "select express_collab_interest(%s, 'me')", (cid,), "filled")


@case
def reopened_collab_takes_applications_again(conn):
    cur = conn.cursor()
    poster, cid = real_collab(cur)
    jr = make_user(cur, "again@example.test")
    as_user(cur, poster)
    cur.execute("update job_collabs set filled_at = now() where id = %s", (cid,))
    cur.execute("update job_collabs set filled_at = null where id = %s", (cid,))
    as_user(cur, jr)
    cur.execute("insert into collab_interests (collab_id, user_id, note) values (%s, %s, 'me')", (cid, jr))
    cur.execute("select interested_count from job_collabs where id = %s", (cid,))
    assert cur.fetchone()[0] == 1


@case
def applicant_cannot_revise_on_filled_collab_but_poster_can_still_decide(conn):
    cur = conn.cursor()
    poster, cid = real_collab(cur)
    jr = make_user(cur, "pending@example.test")
    as_user(cur, jr)
    cur.execute("insert into collab_interests (collab_id, user_id, note) values (%s, %s, 'me') returning id", (cid, jr))
    iid = cur.fetchone()[0]
    as_user(cur, poster)
    cur.execute("update job_collabs set filled_at = now() where id = %s", (cid,))
    as_user(cur, jr)
    expect_error(cur, "update collab_interests set note = 'changed' where id = %s", (iid,), "filled")
    expect_error(cur, "insert into collab_interests (collab_id, user_id, note) values (%s, %s, 'me2') "
                      "on conflict (collab_id, user_id) do update set note = excluded.note", (cid, jr), "filled")
    as_user(cur, poster)
    cur.execute("update collab_interests set status = 'declined' where id = %s", (iid,))
    assert cur.rowcount == 1, "the poster can still answer a pending applicant after filling"
    as_user(cur, jr)
    cur.execute("delete from collab_interests where id = %s", (iid,))
    assert cur.rowcount == 1, "withdrawing stays possible"


@case
def filled_founding_collab_refuses_with_position_filled_first(conn):
    cur = conn.cursor()
    real, fm = founding_pair(cur)
    cur.execute("insert into job_collabs (poster_id, type, title, body, filled_at) values (%s, 'ride_along', 't', 'b', now()) returning id", (fm,))
    cid = cur.fetchone()[0]
    as_user(cur, real)
    expect_error(cur, "insert into collab_interests (collab_id, user_id, note) values (%s, %s, 'me')", (cid, real), "position has been filled")


@case
def express_interest_rpc_cannot_bypass_the_founding_guard(conn):
    # The 0004 RPC is SECURITY DEFINER, so triggers inside it see the owner
    # role; it must check the founding rule itself.
    cur = conn.cursor()
    real, fm = founding_pair(cur)
    cur.execute("insert into job_collabs (poster_id, type, title, body) values (%s, 'ride_along', 't', 'b') returning id", (fm,))
    cid = cur.fetchone()[0]
    as_user(cur, real)
    expect_error(cur, "select express_collab_interest(%s, 'me')", (cid,), "Founding Community")


@case
def staff_seeding_can_write_interests_on_filled_collabs_quietly(conn):
    cur = conn.cursor()
    poster, cid = real_collab(cur)
    jr = make_user(cur, "seeded@example.test")
    cur.execute("select count(*) from notifications")
    before = cur.fetchone()[0]
    cur.execute("set local homefixr.seeding = 'on'")
    cur.execute("update job_collabs set filled_at = now() where id = %s", (cid,))
    cur.execute("insert into collab_interests (collab_id, user_id, note, status) values (%s, %s, 'me', 'accepted')", (cid, jr))
    cur.execute("select count(*) from notifications")
    assert cur.fetchone()[0] == before, "seeding must not notify"


if __name__ == "__main__":
    width = max(len(n) for n, _, _ in RESULTS)
    failed = 0
    for name, ok, msg in RESULTS:
        print(f"{'PASS' if ok else 'FAIL'}  {name.ljust(width)}  {msg}")
        failed += not ok
    print(f"\n{len(RESULTS) - failed}/{len(RESULTS)} passed")
    sys.exit(1 if failed else 0)
