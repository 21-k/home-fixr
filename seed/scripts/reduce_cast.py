# /// script
# requires-python = ">=3.10"
# dependencies = ["psycopg[binary]>=3.1", "pyyaml>=6"]
# ///
"""
Cut the example batch fm-2026-10 from 136 to 29 accounts (9 mentors + 20 apprentices).

    uv run seed/scripts/reduce_cast.py            # rewrite the content files, the SQL and the edit log
    uv run seed/scripts/reduce_cast.py --check    # build everything in memory, write nothing

Inputs (never modified):
  seed/personas/full-136/{seniors,juniors}.json      the 136 personas as live
  seed/content/full-136/*.json                       threads, social graph, collabs as live
  seed/content/reduce/plan.yaml                      who stays, mentorships, follows, collabs (owner decisions)
  seed/content/reduce/repairs.yaml                   reply/body edits, drops, accepted answers

Outputs:
  seed/personas/{seniors,juniors}.json               the 29 personas
  seed/content/threads.scheduled.json                the 104 kept threads, repaired. Each reply keeps
                                                     its ORIGINAL index as "idx", so seed.py gives it the
                                                     same uuid5 id it has in production
  seed/content/threads.sample.scheduled.json         the 11 kept live sample threads (same form)
  seed/content/{mentorships,follows,collabs,persona_memory}.json
  seed/out/reduce-cast-fm-2026-10.sql                ONE guarded transaction for production
  seed/reports/reduce_edits.md                       every edit, with the original text

Deterministic: no randomness; the same inputs give byte-identical outputs.
The production file is generated from the full-136 files (what is live) and
the plan, so it targets exact rows by their uuid5 ids (seed.uid()).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

sys.path.insert(0, str(Path(__file__).parent))
from common import BATCH_ID, SEED_DIR  # noqa: E402
from gen_threads import rebalance_helpful, words  # noqa: E402
from schedule import NICKNAMES  # noqa: E402
from seed import COLLAB_ZERO, SOCIAL_ZERO, WINDOW_END_SQL, WINDOW_START_SQL, _arr, _check_block, _lit, uid  # noqa: E402

NY = ZoneInfo("America/New_York")
FULL = SEED_DIR / "content/full-136"
FULL_P = SEED_DIR / "personas/full-136"
PLAN = SEED_DIR / "content/reduce/plan.yaml"
REPAIRS = SEED_DIR / "content/reduce/repairs.yaml"
SQL_OUT = SEED_DIR / "out/reduce-cast-fm-2026-10.sql"
LOG_OUT = SEED_DIR / "reports/reduce_edits.md"
WINDOW_START = datetime(2026, 7, 24, 0, 0, tzinfo=NY)
WINDOW_END = datetime(2026, 10, 4, 23, 59, 59, tzinfo=NY)
# What production holds before the cut (checked by the SQL before it touches anything).
LIVE = {"profiles": 136, "posts": 213, "replies": 1224, "mentorships": 36, "follows": 389, "job_collabs": 20, "collab_interests": 61}

dt = datetime.fromisoformat


def jload(p: Path):
    return json.loads(p.read_text())


def jdump(p: Path, data) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def fail(msg: str) -> None:
    raise SystemExit(f"reduce_cast: {msg}")


# ------------------------------------------------------------------ mentions
def mention_patterns(removed: list[dict], kept: list[dict]) -> list[tuple[str, re.Pattern]]:
    """Ways a kept text could still point at a removed person: their handle (with or
    without @, case-insensitive, a trailing-digit-free stem for handles like
    'ParkwayPipes'), a Senior's nickname, or a display first name nobody kept uses."""
    kept_names = {n for p in kept for n in NICKNAMES.get(p["handle"], [])}
    kept_names |= {(p["display_name"] or "").split()[0].lower() for p in kept if p["display_name"]}
    out = []
    for p in removed:
        h = p["handle"]
        names = {h.lower()}
        names |= set(NICKNAMES.get(h, []))
        if p["display_name"] and p["display_preference"] != "handle":
            first = p["display_name"].split()[0].lower()
            if first not in kept_names and len(first) > 2:
                names.add(first)
        for n in sorted(names):
            out.append((h, re.compile(rf"(?<![\w.]){re.escape(n)}(?![\w])", re.I)))
    return out


def find_mentions(text: str, pats) -> list[str]:
    return sorted({h for h, rx in pats if rx.search(text)})


# ------------------------------------------------------------------ build
class Reduced:
    def __init__(self):
        self.plan = yaml.safe_load(PLAN.read_text())
        self.repairs = yaml.safe_load(REPAIRS.read_text()) or {}
        self.people_full = jload(FULL_P / "seniors.json") + jload(FULL_P / "juniors.json")
        self.threads_full = jload(FULL / "threads.scheduled.json")
        self.sample_full = jload(FULL / "threads.sample.scheduled.json")
        self.ments_full = jload(FULL / "mentorships.json")
        self.follows_full = jload(FULL / "follows.json")
        self.collabs_full = jload(FULL / "collabs.json")
        self.memory_full = jload(FULL / "persona_memory.json")
        self.by = {p["handle"]: p for p in self.people_full}
        self.log: dict[str, list[dict]] = defaultdict(list)
        self.helpful_changes: list[dict] = []
        self.build()

    # ---- who stays
    def cast(self) -> None:
        P = self.plan
        threads = self.threads_full["threads"]
        posts = Counter()
        for t in threads:
            posts[t["author"]] += 1
            for r in t["replies"]:
                posts[r["author"]] += 1
        juniors = [p for p in self.people_full if p["role"] == "junior"]
        ranked = sorted(juniors, key=lambda p: (-posts[p["handle"]], p["handle"].lower()))
        top = [p["handle"] for p in ranked[:20]]
        if ranked[19] and posts[ranked[19]["handle"]] == posts[ranked[20]["handle"]]:
            print(f"note: a tie at #20/#21 ({ranked[19]['handle']}, {ranked[20]['handle']}) broken by handle")
        if set(top) != set(P["apprentices"]):
            fail(f"plan apprentices differ from the computed top 20: +{set(top) - set(P['apprentices'])} -{set(P['apprentices']) - set(top)}")
        self.top20 = [(p["handle"], posts[p["handle"]]) for p in ranked[:21]]
        mentors = P["mentors"]
        bad = [h for h in mentors if self.by[h]["role"] != "senior"]
        if bad or len(mentors) != 9 or len(P["apprentices"]) != 20:
            fail(f"cast must be 9 seniors + 20 juniors: {bad}")
        self.keep = set(mentors) | set(P["apprentices"])
        self.people = [p for p in self.people_full if p["handle"] in self.keep]
        self.removed = [p for p in self.people_full if p["handle"] not in self.keep]
        self.posts_count = posts
        self.pats = mention_patterns(self.removed, self.people)

    # ---- threads
    def threads_reduced(self) -> None:
        K = self.keep
        out = []
        self.dropped_replies: list[tuple[str, int]] = []      # kept-author replies dropped by a repair
        self.reply_edits: list[tuple[str, int, str, str]] = []  # (thread, idx, old body, new body)
        self.body_edits: list[tuple[str, str, str]] = []
        self.accepted_changes: list[tuple[str, int, bool, bool]] = []  # (thread, idx, old, new)
        unknown = set(self.repairs) - {t["id"] for t in self.threads_full["threads"] if t["author"] in K}
        if unknown:
            fail(f"repairs for threads that aren't kept: {sorted(unknown)}")
        for t in self.threads_full["threads"]:
            if t["author"] not in K:
                continue
            tid = t["id"]
            nt = {k: v for k, v in t.items() if k != "replies"}
            orig_body = t["body"]
            reps = {i: dict(r, idx=i) for i, r in enumerate(t["replies"]) if r["author"] in K}
            lost = [(i, r) for i, r in enumerate(t["replies"]) if r["author"] not in K]
            items = self.repairs.get(tid, [])
            acc_item = None
            for it in items:
                why = it.get("why") or fail(f"{tid}: repair without a reason: {it}")
                if it.get("body"):
                    if nt["body"].count(it["old"]) != 1:
                        fail(f"{tid} body: old text not found exactly once: {it['old'][:60]!r}")
                    nt["body"] = nt["body"].replace(it["old"], it["new"])
                    self.log[tid].append({"kind": "body", "old": it["old"], "new": it["new"], "why": why})
                elif "accepted" in it:
                    acc_item = it
                elif it.get("drop"):
                    i = it["r"]
                    if i not in reps:
                        fail(f"{tid}/r{i}: drop of a reply that isn't kept")
                    self.log[tid].append({"kind": "drop", "r": i, "author": reps[i]["author"], "old": reps[i]["body"].strip(), "why": why})
                    self.dropped_replies.append((tid, i))
                    del reps[i]
                else:
                    i = it["r"]
                    if i not in reps:
                        fail(f"{tid}/r{i}: edit of a reply that isn't kept")
                    b = reps[i]["body"]
                    if b.count(it["old"]) != 1:
                        fail(f"{tid}/r{i}: old text not found exactly once: {it['old'][:60]!r}")
                    reps[i]["body"] = b.replace(it["old"], it["new"])
                    self.log[tid].append({"kind": "edit", "r": i, "author": reps[i]["author"], "old": it["old"], "new": it["new"], "why": why})
            if nt["body"] != orig_body:
                self.body_edits.append((tid, orig_body.strip(), nt["body"].strip()))
            for i, r in reps.items():
                if r["body"] != t["replies"][i]["body"]:
                    self.reply_edits.append((tid, i, t["replies"][i]["body"].strip(), r["body"].strip()))
            # accepted answer
            lost_acc = [i for i, r in lost if r["accepted"]]
            before = {i: r["accepted"] for i, r in reps.items()}
            if acc_item is not None:
                a = acc_item["accepted"]
                if a != "none" and a not in reps:
                    fail(f"{tid}: accepted r{a} isn't a kept reply")
                for i, r in reps.items():
                    r["accepted"] = (i == a)
                self.log[tid].append({"kind": "accepted", "r": None if a == "none" else a,
                                      "author": None if a == "none" else reps[a]["author"], "why": acc_item["why"],
                                      "lost": [(i, t["replies"][i]["author"]) for i in lost_acc]})
            elif lost_acc:
                fail(f"{tid}: the accepted reply (r{lost_acc}) was removed; repairs.yaml must say which reply is accepted now, or none")
            for i, r in reps.items():
                if r["accepted"] != before[i]:
                    self.accepted_changes.append((tid, i, before[i], r["accepted"]))
            # helpful: accepted and substantive mentor answers lead (gen_threads.rebalance_helpful)
            kept_list = [reps[i] for i in sorted(reps)]
            if lost or acc_item is not None or any(e["kind"] == "drop" for e in self.log.get(tid, [])):
                for r in kept_list:
                    r["_role"] = self.by[r["author"]]["role"]
                old_h = {r["idx"]: r["helpful_count"] for r in kept_list}
                rebalance_helpful(kept_list)
                for r in kept_list:
                    del r["_role"]
                    if r["helpful_count"] != old_h[r["idx"]]:
                        self.helpful_changes.append({"thread": tid, "r": r["idx"], "old": old_h[r["idx"]], "new": r["helpful_count"]})
                        self.log[tid].append({"kind": "helpful", "r": r["idx"], "author": r["author"], "old": old_h[r["idx"]], "new": r["helpful_count"],
                                              "why": "accepted / substantive mentor answers lead after the removals (gen_threads.rebalance_helpful)"})
            nt["replies"] = kept_list
            nt["_lost"] = [(i, r["author"]) for i, r in lost]
            out.append(nt)
        self.threads = out
        # Nothing kept may still point at a removed person.
        hits = []
        for t in out:
            for where, text in [(t["id"], t["title"] + "\n" + t["body"])] + [(f"{t['id']}/r{r['idx']}", r["body"]) for r in t["replies"]]:
                m = find_mentions(text, self.pats)
                if m:
                    hits.append(f"{where}: {m}")
        if hits:
            fail("kept text still mentions removed people:\n  " + "\n  ".join(hits))
        lost_threads = [t for t in out if t["_lost"]]
        unrepaired = [t["id"] for t in lost_threads if t["id"] not in self.repairs]
        self.repaired_ids = sorted({t["id"] for t in lost_threads} & set(self.repairs) | set(self.repairs))
        self.lost_threads = [t["id"] for t in lost_threads]
        self.unedited_lost = unrepaired  # lost replies, but nothing needed repairing (reviewed)

    # ---- mentorships
    def mentorships(self) -> None:
        K = self.keep
        rows = [dict(m) for m in self.ments_full["mentorships"] if m["junior"] in K and m["senior"] in K]
        self.ment_kept_ids = [(m["junior"], m["senior"]) for m in rows]
        self.ment_status_changes = []
        for ch in self.plan.get("mentorship_status", []):
            m = next((m for m in rows if m["junior"] == ch["junior"] and m["senior"] == ch["senior"]), None)
            if not m:
                fail(f"mentorship_status: no kept row {ch['junior']}->{ch['senior']}")
            self.ment_status_changes.append((m["junior"], m["senior"], m["status"], ch["status"]))
            m["status"] = ch["status"]
            m["decided_at"] = ch.get("decided_at")
            m["why"] = m["why"] + "; " + ch["why"]
        self.ment_new = []
        for n in self.plan.get("mentorships_new", []):
            if (n["junior"], n["senior"]) in {(m["junior"], m["senior"]) for m in rows}:
                fail(f"duplicate mentorship {n['junior']}->{n['senior']}")
            row = {"junior": n["junior"], "senior": n["senior"], "status": n["status"], "requested_at": n["requested_at"],
                   "decided_at": n.get("decided_at"), "anchor_thread": n.get("anchor_thread"), "why": n["why"]}
            rows.append(row)
            self.ment_new.append(row)
        for m in rows:
            if m["junior"] not in K or m["senior"] not in K:
                fail(f"mentorship outside the cast {m}")
            req = dt(m["requested_at"])
            if not (WINDOW_START <= req <= WINDOW_END) or req.astimezone(NY).hour < 5:
                fail(f"mentorship {m['junior']}->{m['senior']}: request time {req}")
            if m["status"] != "pending":
                d = dt(m["decided_at"])
                if not (req + timedelta(hours=1) <= d <= min(WINDOW_END, req + timedelta(days=7))):
                    fail(f"mentorship {m['junior']}->{m['senior']}: decided {d}")
            j, s = self.by[m["junior"]], self.by[m["senior"]]
            if req < dt(j["joined_at"]) + timedelta(days=2) or req < dt(s["joined_at"]):
                fail(f"mentorship {m['junior']}->{m['senior']} before both joined")
        rows.sort(key=lambda m: m["requested_at"])
        self.ments = rows

    # ---- follows
    def follows(self) -> None:
        K = self.keep
        rows = [dict(f) for f in self.follows_full["follows"] if f["follower"] in K and f["following"] in K]
        have = {(f["follower"], f["following"]) for f in rows}
        self.follow_new = []
        for f in self.plan.get("follows_new", []):
            k = (f["follower"], f["following"])
            if k in have or k[0] == k[1] or k[0] not in K or k[1] not in K:
                fail(f"bad new follow {k}")
            t = dt(f["created_at"])
            lo = max(dt(self.by[k[0]]["joined_at"]), dt(self.by[k[1]]["joined_at"]))
            if not (lo < t <= WINDOW_END) or t.astimezone(NY).hour < 5:
                fail(f"follow {k}: time {t}")
            have.add(k)
            row = {"follower": k[0], "following": k[1], "created_at": f["created_at"], "why": f["why"]}
            rows.append(row)
            self.follow_new.append(row)
        rows.sort(key=lambda f: (f["created_at"], f["follower"], f["following"]))
        self.follows_rows = rows

    # ---- collabs
    def collabs(self) -> None:
        K = self.keep
        P = self.plan
        drop = set(P.get("collabs_drop", []))
        self.collabs_dropped = [c for c in self.collabs_full["collabs"] if c["poster"] not in K or c["id"] in drop]
        out = []
        active = {(m["junior"], m["senior"]): dt(m["decided_at"]) for m in self.ments if m["status"] == "active"}
        self.pitch_status_changes = []
        self.pitch_new = []
        for c in self.collabs_full["collabs"]:
            if c["poster"] not in K or c["id"] in drop:
                continue
            nc = dict(c)
            nc["pitches"] = [dict(b) for b in c["pitches"] if b["applicant"] in K]
            for ch in [x for x in P.get("pitch_status", []) if x["collab"] == c["id"]]:
                b = next((b for b in nc["pitches"] if b["applicant"] == ch["applicant"]), None)
                if not b:
                    fail(f"pitch_status: {c['id']}/{ch['applicant']} isn't a kept pitch")
                self.pitch_status_changes.append((c["id"], b["applicant"], b["status"], ch["status"], ch["why"]))
                b["status"] = ch["status"]
                b["decided_at"] = ch["decided_at"]
            for n in [x for x in P.get("pitches_new", []) if x["collab"] == c["id"]]:
                j = self.by[n["applicant"]]
                applied = dt(n["applied_at"])
                since = j.get("license_since") or {}
                held = [x for x in j["licenses"] if x not in since or since[x] <= applied.astimezone(NY).date().isoformat()]
                m = re.search(r"'(\d{2})\b", j.get("affiliation_hint") or "")
                age = j.get("age")
                band = None
                if age is not None:
                    band = next((b for lo, hi, b in ((0, 17, "under_18"), (18, 24, "18_24"), (25, 34, "25_34"), (35, 44, "35_44"), (45, 54, "45_54"))
                                 if lo <= age <= hi), "55_plus")
                row = {"applicant": n["applicant"], "status": n["status"], "note": n["note"], "years_experience": j["years_in"],
                       "graduation_year": (2000 + int(m.group(1))) if (m and j["path"] == "votech_grad") else None,
                       "age_range": band, "skills": n.get("skills") or None, "is_licensed": bool(held),
                       "license_note": ", ".join(held) or None, "has_own_tools": bool(n.get("tools")),
                       "has_transport": bool(n.get("transport")), "applied_at": n["applied_at"], "decided_at": n.get("decided_at"),
                       "mentee_of_poster": False}
                nc["pitches"].append(row)
                self.pitch_new.append((c["id"], row, n["why"]))
            for b in nc["pitches"]:
                pair = (b["applicant"], c["poster"])
                b["mentee_of_poster"] = pair in active and dt(b["applied_at"]) > active[pair]
            nc["pitches"].sort(key=lambda b: b["applied_at"])
            # invariants
            acc = [b for b in nc["pitches"] if b["status"] == "accepted"]
            if len(acc) != 1:
                fail(f"{c['id']}: {len(acc)} accepted pitches")
            filled = dt(c["filled_at"])
            for b in nc["pitches"]:
                a = dt(b["applied_at"])
                if not (dt(c["posted_at"]) < a < filled) or a < dt(self.by[b["applicant"]]["joined_at"]) or a.astimezone(NY).hour < 5:
                    fail(f"{c['id']}/{b['applicant']}: applied {a}")
                if b.get("decided_at") and not (a < dt(b["decided_at"]) <= WINDOW_END):
                    fail(f"{c['id']}/{b['applicant']}: decided before applying")
                if b["status"] == "accepted" and not dt(b["decided_at"]) < filled:
                    fail(f"{c['id']}/{b['applicant']}: accepted after the collab was filled")
                if self.by[b["applicant"]]["trade"] not in (c["trade"], "general"):
                    fail(f"{c['id']}/{b['applicant']}: trade {self.by[b['applicant']]['trade']} vs {c['trade']}")
            out.append(nc)
        self.collabs_rows = out

    def build(self) -> None:
        self.cast()
        self.threads_reduced()
        self.mentorships()
        self.follows()
        self.collabs()
        # persona memory: what each kept persona appears in now
        appears = defaultdict(set)
        for t in self.threads:
            appears[t["author"]].add(t["id"])
            for r in t["replies"]:
                appears[r["author"]].add(t["id"])
        self.memory = {h: {**v, "appears_in": sorted(appears[h])} for h, v in self.memory_full.items() if h in self.keep}

    # ------------------------------------------------------------- outputs
    def content(self) -> dict[str, object]:
        threads = [{k: v for k, v in t.items() if not k.startswith("_")} for t in self.threads]
        live = {t["id"] for t in self.sample_full["threads"]}
        sample = [t for t in threads if t["id"] in live]
        note = ("Reduced cast (9 mentors + 20 apprentices) generated by seed/scripts/reduce_cast.py from "
                "content/full-136/. Reply 'idx' = the reply's index in the full thread (its uuid5 id).")
        return {
            "personas/seniors.json": [p for p in self.people if p["role"] == "senior"],
            "personas/juniors.json": [p for p in self.people if p["role"] == "junior"],
            "content/threads.scheduled.json": {**{k: v for k, v in self.threads_full.items() if k != "threads"}, "reduced": note, "threads": threads},
            "content/threads.sample.scheduled.json": {**{k: v for k, v in self.sample_full.items() if k != "threads"}, "reduced": note, "threads": sample},
            "content/mentorships.json": {**{k: v for k, v in self.ments_full.items() if k != "mentorships"}, "reduced": note, "mentorships": self.ments},
            "content/follows.json": {**{k: v for k, v in self.follows_full.items() if k != "follows"}, "reduced": note, "follows": self.follows_rows},
            "content/collabs.json": {**{k: v for k, v in self.collabs_full.items() if k != "collabs"}, "reduced": note, "collabs": self.collabs_rows},
            "content/persona_memory.json": self.memory,
        }

    # ------------------------------------------------------------------ SQL
    def sql(self) -> str:
        B = BATCH_ID
        L = _lit
        b = L(B)
        pid = lambda h: uid(B, "profile", h.lower())  # noqa: E731
        rm = [p for p in self.removed]
        rm_ids = [pid(p["handle"]) for p in rm]
        kept_ids = [pid(p["handle"]) for p in self.people]
        drop_collab_ids = [uid(B, "collab", c["id"]) for c in self.collabs_dropped]
        drop_reply_ids = [uid(B, "reply", t, str(i)) for t, i in self.dropped_replies]
        n_rep = sum(len(t["replies"]) for t in self.threads)
        st = Counter(m["status"] for m in self.ments)
        pst = Counter(x["status"] for c in self.collabs_rows for x in c["pitches"])
        n_pitch = sum(len(c["pitches"]) for c in self.collabs_rows)
        removed_rows = {  # what the cut removes from the batch
            "replies by removed accounts or on their threads": sum(
                1 for t in self.threads_full["threads"] for r in t["replies"] if t["author"] not in self.keep or r["author"] not in self.keep),
            "replies dropped by a repair": len(drop_reply_ids),
        }
        out = [
            f"-- Founding Community batch {B}: CUT THE EXAMPLE CAST from {LIVE['profiles']} to {len(self.people)} accounts",
            f"-- ({sum(p['role'] == 'senior' for p in self.people)} mentors + {sum(p['role'] == 'junior' for p in self.people)} apprentices). "
            "Generated by seed/scripts/reduce_cast.py; do not edit by hand.",
            f"-- Removes {len(rm)} example accounts with everything they wrote, {len(self.threads_full['threads']) - len(self.threads)} threads, "
            f"{removed_rows['replies by removed accounts or on their threads']} replies (+{len(drop_reply_ids)} kept-author replies that only made",
            f"-- sense after a removed one), {LIVE['mentorships'] - len(self.ment_kept_ids)} mentorships, {LIVE['follows'] - (len(self.follows_rows) - len(self.follow_new))} follows, "
            f"{len(self.collabs_dropped)} collabs and the pitches of removed apprentices;",
            f"-- repairs {len(self.reply_edits)} reply bodies and {len(self.body_edits)} thread bodies, {len(self.accepted_changes)} accepted flags and "
            f"{len(self.helpful_changes)} helpful counts (as deltas, so real votes are kept);",
            f"-- adds {len(self.ment_new)} mentorships (+{len(self.ment_status_changes)} pending -> active), {len(self.follow_new)} follows and "
            f"{len(self.pitch_new)} pitches ({len(self.pitch_status_changes)} existing pitches change status).",
            "-- One transaction, homefixr.seeding = 'on' (nothing notifies). It:",
            "--   * aborts unless the batch is exactly in its live state (136 profiles with the expected ids and handles, 213 posts,",
            "--     1,224 replies, 36 mentorships, 389 follows, 20 collabs, 61 pitches, and the rows it edits still hold the seeded text);",
            "--   * aborts if any real (non-seeded) member's post, reply, message, mentorship or collab application would be deleted;",
            "--   * REPORTS (does not block) real follows of removed accounts and real helpful votes on removed content: both are dropped;",
            "--   * aborts if the batch has already been cut (29 profiles), so a second run changes nothing.",
            "begin;",
            "set local homefixr.seeding = 'on';",
            "create temp table _rm (id uuid primary key, handle text not null) on commit drop;",
            "insert into _rm (id, handle) values\n  " + ",\n  ".join(f"({L(pid(p['handle']))}, {L(p['handle'])})" for p in rm) + ";",
            "create temp table _keep (id uuid primary key, handle text not null, role text not null) on commit drop;",
            "insert into _keep (id, handle, role) values\n  " + ",\n  ".join(f"({L(pid(p['handle']))}, {L(p['handle'])}, {L(p['role'])})" for p in self.people) + ";",
            "create temp table _drop_collabs (id uuid primary key, cid text not null) on commit drop;",
            "insert into _drop_collabs (id, cid) values\n  " + ",\n  ".join(f"({L(uid(B, 'collab', c['id']))}, {L(c['id'])})" for c in self.collabs_dropped) + ";",
            "create temp table _drop_replies (id uuid primary key, ref text not null) on commit drop;",
            "insert into _drop_replies (id, ref) values\n  " + ",\n  ".join(f"({L(uid(B, 'reply', t, str(i)))}, {L(f'{t}/r{i}')})" for t, i in self.dropped_replies) + ";",
            "create temp table _rm_posts on commit drop as select id from posts where seed_batch_id = " + b + " and author_id in (select id from _rm);",
            "create temp table _red_before on commit drop as select (select count(*) from notifications) notifications, "
            "(select count(*) from notifications where user_id in (select id from _rm) or actor_id in (select id from _rm)) notifications_rm, "
            "(select count(*) from posts) posts, (select count(*) from replies) replies, (select count(*) from follows) follows, "
            "(select count(*) from helpful_votes) helpful_votes;",
            "",
            "-- 1. Guards: refuse a second run, refuse anything but the live state.",
            "do $g$ declare n bigint; begin",
            f"  select count(*) into n from profiles where seed_batch_id = {b};",
            f"  if n = {len(self.people)} and not exists (select 1 from profiles p join _rm on _rm.id = p.id) then",
            f"    raise exception 'batch {B} already has {len(self.people)} profiles: the cast was already cut, nothing to do';",
            "  end if;",
            f"  if n <> {LIVE['profiles']} then raise exception 'batch {B}: expected {LIVE['profiles']} profiles, found %', n; end if;",
            "  select count(*) into n from profiles p join (select id, handle from _rm union all select id, handle from _keep) v "
            f"on v.id = p.id and v.handle = p.username where p.seed_batch_id = {b};",
            f"  if n <> {LIVE['profiles']} then raise exception 'batch {B}: only % of {LIVE['profiles']} profiles have the expected id and handle', n; end if;",
            "  select count(*) into n from profiles p join _keep k on k.id = p.id where p.role::text = k.role;",
            f"  if n <> {len(self.people)} then raise exception 'batch {B}: kept profiles with an unexpected role'; end if;",
        ]
        for tbl, want in (("posts", LIVE["posts"]), ("replies", LIVE["replies"]), ("mentorships", LIVE["mentorships"]),
                          ("follows", LIVE["follows"]), ("job_collabs", LIVE["job_collabs"]), ("collab_interests", LIVE["collab_interests"])):
            out.append(f"  select count(*) into n from {tbl} where seed_batch_id = {b};")
            out.append(f"  if n <> {want} then raise exception 'batch {B}: expected {want} {tbl}, found %', n; end if;")
        out.append(f"  select count(*) into n from auth.users where raw_app_meta_data->>'seed_batch_id' = {b} and id in (select id from _rm);")
        out.append(f"  if n <> {len(rm)} then raise exception 'batch {B}: % of {len(rm)} removed accounts have their auth user', n; end if;")
        refuse = [
            ("posts by removed accounts that aren't seeded rows",
             f"select count(*) from posts where author_id in (select id from _rm) and seed_batch_id is distinct from {b}"),
            ("replies by removed accounts that aren't seeded rows",
             f"select count(*) from replies where author_id in (select id from _rm) and seed_batch_id is distinct from {b}"),
            ("real replies on threads that go",
             f"select count(*) from replies r join _rm_posts x on x.id = r.post_id where r.seed_batch_id is distinct from {b}"),
            ("real replies among the replies a repair drops",
             f"select count(*) from replies r join _drop_replies d on d.id = r.id where r.seed_batch_id is distinct from {b}"),
            ("messages to or from removed accounts",
             "select count(*) from messages where sender_id in (select id from _rm) or recipient_id in (select id from _rm)"),
            ("real mentorships with removed accounts",
             f"select count(*) from mentorships where (junior_id in (select id from _rm) or senior_id in (select id from _rm)) and seed_batch_id is distinct from {b}"),
            ("real collab applications on collabs that go, or by removed accounts",
             f"select count(*) from collab_interests ci where ci.seed_batch_id is distinct from {b} and (ci.user_id in (select id from _rm) "
             "or ci.collab_id in (select id from _drop_collabs) or ci.collab_id in (select id from job_collabs where poster_id in (select id from _rm)))"),
            ("real collabs posted by removed accounts",
             f"select count(*) from job_collabs where poster_id in (select id from _rm) and seed_batch_id is distinct from {b}"),
        ]
        for name, q in refuse:
            out.append(f"  execute $q${q}$q$ into n;")
            msg = name.replace("'", "''")
            out.append(f"  if n <> 0 then raise exception 'refusing to delete real members'' rows: % {msg}', n; end if;")
        # The collabs to drop are exactly the batch collabs by removed posters + the plan's drops.
        out.append(f"  select count(*) into n from job_collabs where seed_batch_id = {b} and id in (select id from _drop_collabs);")
        out.append(f"  if n <> {len(drop_collab_ids)} then raise exception 'batch {B}: % of {len(drop_collab_ids)} collabs to drop found', n; end if;")
        out.append(f"  if exists (select 1 from job_collabs where seed_batch_id = {b} and poster_id in (select id from _rm) and id not in (select id from _drop_collabs)) "
                   "then raise exception 'a removed account posted a collab that is not in the drop list'; end if;")
        out.append(f"  select count(*) into n from replies where seed_batch_id = {b} and id in (select id from _drop_replies);")
        out.append(f"  if n <> {len(drop_reply_ids)} then raise exception 'batch {B}: % of {len(drop_reply_ids)} replies to drop found', n; end if;")
        # The rows the repair edits must still hold what was seeded.
        edits = [(uid(B, "reply", t, str(i)), old) for t, i, old, _ in self.reply_edits]
        if edits:
            out.append("  select count(*) into n from replies r join (values\n    " + ",\n    ".join(f"({L(i)}::uuid, {L(o)})" for i, o in edits)
                       + f"\n  ) v(id, body) on v.id = r.id and v.body = r.body where r.seed_batch_id = {b};")
            out.append(f"  if n <> {len(edits)} then raise exception 'batch {B}: only % of the {len(edits)} replies to repair still hold the seeded text', n; end if;")
        pedits = [(uid(B, "post", t), old) for t, old, _ in self.body_edits]
        if pedits:
            out.append("  select count(*) into n from posts p join (values\n    " + ",\n    ".join(f"({L(i)}::uuid, {L(o)})" for i, o in pedits)
                       + f"\n  ) v(id, body) on v.id = p.id and v.body = p.body where p.seed_batch_id = {b};")
            out.append(f"  if n <> {len(pedits)} then raise exception 'batch {B}: only % of the {len(pedits)} thread bodies to repair still hold the seeded text', n; end if;")
        acc = [(uid(B, "reply", t, str(i)), old) for t, i, old, _ in self.accepted_changes]
        if acc:
            out.append("  select count(*) into n from replies r join (values\n    " + ",\n    ".join(f"({L(i)}::uuid, {L(o)})" for i, o in acc)
                       + f"\n  ) v(id, a) on v.id = r.id and v.a = r.is_accepted where r.seed_batch_id = {b};")
            out.append(f"  if n <> {len(acc)} then raise exception 'batch {B}: accepted flags changed since seeding on % of {len(acc)} rows', n - {len(acc)}; end if;")
        for j, s, old, new in self.ment_status_changes:
            mid = uid(B, "mentorship", j.lower(), s.lower())
            out.append(f"  select count(*) into n from mentorships where id = {L(mid)} and status::text = {L(old)} and seed_batch_id = {b};")
            out.append(f"  if n <> 1 then raise exception 'mentorship {j} -> {s} is not {old} any more'; end if;")
        for cid, ap, old, new, _ in self.pitch_status_changes:
            iid = uid(B, "collab_interest", cid, ap.lower())
            out.append(f"  select count(*) into n from collab_interests where id = {L(iid)} and status::text = {L(old)} and seed_batch_id = {b};")
            out.append(f"  if n <> 1 then raise exception 'pitch {cid}/{ap} is not {old} any more'; end if;")
        new_mids = [uid(B, "mentorship", m["junior"].lower(), m["senior"].lower()) for m in self.ment_new]
        out.append(f"  if exists (select 1 from mentorships where id in ({', '.join(L(i) for i in new_mids)})) then raise exception 'new mentorships already exist'; end if;")
        out.append("end $g$;")
        out.append("")
        out.append("-- 2. Report (not refuse): real rows that go with the removed accounts. Shown again in the final summary.")
        out.append("create temp table _red_report on commit drop as")
        out.append("  select 'real follow of a removed account (dropped)'::text item, f.follower_id actor, a.username who, r.handle target, f.created_at at "
                   "from follows f join _rm r on r.id = f.following_id join profiles a on a.id = f.follower_id "
                   f"where f.seed_batch_id is distinct from {b} and a.seed_batch_id is distinct from {b}")
        out.append("  union all select 'real follow BY a removed account (dropped)', f.follower_id, r.handle, c.username, f.created_at "
                   f"from follows f join _rm r on r.id = f.follower_id join profiles c on c.id = f.following_id where f.seed_batch_id is distinct from {b}")
        out.append("  union all select 'real helpful vote on a removed reply (dropped)', v.user_id, a.username, x.username || ': ' || left(r.body, 60), v.created_at "
                   "from helpful_votes v join replies r on r.id = v.reply_id join profiles a on a.id = v.user_id "
                   "join profiles x on x.id = r.author_id "
                   f"where r.seed_batch_id = {b} and (r.author_id in (select id from _rm) or r.post_id in (select id from _rm_posts) or r.id in (select id from _drop_replies))")
        out.append("  union all select 'real helpful vote on a removed thread (dropped)', v.user_id, a.username, p.title, v.created_at "
                   "from helpful_votes v join posts p on p.id = v.post_id join profiles a on a.id = v.user_id "
                   "where p.id in (select id from _rm_posts)")
        out.append("  union all select 'real helpful vote on kept content (kept)', v.user_id, a.username, coalesce(p.title, left(r.body, 60)), v.created_at "
                   "from helpful_votes v join profiles a on a.id = v.user_id left join posts p on p.id = v.post_id left join replies r on r.id = v.reply_id "
                   f"where coalesce(p.seed_batch_id, r.seed_batch_id) = {b} and coalesce(p.id, r.id) not in (select id from _rm_posts) "
                   "and coalesce(r.author_id, p.author_id) not in (select id from _rm) and coalesce(r.post_id, '00000000-0000-0000-0000-000000000000') not in (select id from _rm_posts) "
                   "and coalesce(r.id, '00000000-0000-0000-0000-000000000000') not in (select id from _drop_replies);")
        out.append("do $r$ declare x record; begin for x in select item, who, target from _red_report loop "
                   "raise notice 'REPORT %: % -> %', x.item, x.who, x.target; end loop; end $r$;")
        out.append("select item, who, target, at from _red_report order by item, at;")
        out.append("")
        out.append("-- 3. Delete, FK-safe: votes, pitches, collabs, follows, mentorships, replies, posts, notifications, auth users (-> profiles).")
        out += [
            "delete from helpful_votes v using replies r where v.reply_id = r.id and r.seed_batch_id = " + b
            + " and (r.author_id in (select id from _rm) or r.post_id in (select id from _rm_posts) or r.id in (select id from _drop_replies));",
            "delete from helpful_votes where post_id in (select id from _rm_posts);",
            f"delete from collab_interests where seed_batch_id = {b} and (user_id in (select id from _rm) or collab_id in (select id from _drop_collabs));",
            f"delete from job_collabs where seed_batch_id = {b} and id in (select id from _drop_collabs);",
            "delete from follows where follower_id in (select id from _rm) or following_id in (select id from _rm);",
            f"delete from mentorships where seed_batch_id = {b} and (junior_id in (select id from _rm) or senior_id in (select id from _rm));",
            f"delete from replies where seed_batch_id = {b} and (author_id in (select id from _rm) or post_id in (select id from _rm_posts) "
            "or id in (select id from _drop_replies));",
            f"delete from posts where seed_batch_id = {b} and id in (select id from _rm_posts);",
            "delete from notifications where user_id in (select id from _rm) or actor_id in (select id from _rm);",
            f"delete from auth.users where id in (select id from _rm) and raw_app_meta_data->>'seed_batch_id' = {b};",
            "",
            "-- 4. Repair what's left: reply and thread bodies (only where the seeded text is still there), accepted answers,",
            "--    helpful counts (as a delta from the seeded value, so real votes are kept).",
        ]
        for t, i, old, new in self.reply_edits:
            out.append(f"update replies set body = {L(new)} where id = {L(uid(B, 'reply', t, str(i)))} and seed_batch_id = {b} and body = {L(old)};  -- {t}/r{i}")
        for t, old, new in self.body_edits:
            out.append(f"update posts set body = {L(new)} where id = {L(uid(B, 'post', t))} and seed_batch_id = {b} and body = {L(old)};  -- {t}")
        # clear first, then set (a post never has two accepted replies, even mid-statement)
        for t, i, old, new in sorted(self.accepted_changes, key=lambda x: x[3]):
            out.append(f"update replies set is_accepted = {L(new)} where id = {L(uid(B, 'reply', t, str(i)))} and seed_batch_id = {b};  -- {t}/r{i}")
        for h in self.helpful_changes:
            d = h["new"] - h["old"]
            out.append(f"update replies set helpful_count = greatest(0, helpful_count + ({d})) where id = {L(uid(B, 'reply', h['thread'], str(h['r'])))} "
                       f"and seed_batch_id = {b};  -- {h['thread']}/r{h['r']}: seeded {h['old']} -> {h['new']}")
        out.append("")
        out.append("-- 5. Mentorships, follows and pitches for the reduced cast.")
        for j, s, old, new in self.ment_status_changes:
            out.append(f"update mentorships set status = {L(new)} where id = {L(uid(B, 'mentorship', j.lower(), s.lower()))} and seed_batch_id = {b} and status::text = {L(old)};"
                       f"  -- {j} -> {s}")
        out.append("insert into mentorships (id, junior_id, senior_id, status, created_at, seed_batch_id) values\n  " + ",\n  ".join(
            f"({L(uid(B, 'mentorship', m['junior'].lower(), m['senior'].lower()))}, {L(pid(m['junior']))}, {L(pid(m['senior']))}, {L(m['status'])}, "
            f"{L(m['requested_at'])}, {b})" for m in self.ment_new) + ";")
        out.append("insert into follows (follower_id, following_id, created_at, seed_batch_id) values\n  " + ",\n  ".join(
            f"({L(pid(f['follower']))}, {L(pid(f['following']))}, {L(f['created_at'])}, {b})" for f in self.follow_new) + ";")
        for cid, ap, old, new, _ in self.pitch_status_changes:
            out.append(f"update collab_interests set status = {L(new)} where id = {L(uid(B, 'collab_interest', cid, ap.lower()))} and seed_batch_id = {b} "
                       f"and status::text = {L(old)};  -- {cid}/{ap}")
        rows = []
        for cid, x, _ in self.pitch_new:
            rows.append(
                f"({L(uid(B, 'collab_interest', cid, x['applicant'].lower()))}, {L(uid(B, 'collab', cid))}, {L(pid(x['applicant']))}, {L(x['status'])}, "
                f"{L(x['note'])}, {L(x['years_experience'])}, {L(x['graduation_year'])}, {L(x['age_range'])}, {_arr(x['skills'])}, {L(x['is_licensed'])}, "
                f"{L(x['license_note'])}, {L(x['has_own_tools'])}, {L(x['has_transport'])}, {L(x['applied_at'])}, {b})")
        out.append("insert into collab_interests (id, collab_id, user_id, status, note, years_experience, graduation_year, age_range, skills, "
                   "is_licensed, license_note, has_own_tools, has_transport, created_at, seed_batch_id) values\n  " + ",\n  ".join(rows) + ";")
        out.append("")
        out.append("-- 6. Verify the result; any failure rolls everything back.")
        expect = {
            f"select count(*) from profiles where seed_batch_id = {b}": len(self.people),
            f"select count(*) from profiles where seed_batch_id = {b} and role = 'senior'": sum(p["role"] == "senior" for p in self.people),
            f"select count(*) from profiles where seed_batch_id = {b} and role = 'junior'": sum(p["role"] == "junior" for p in self.people),
            f"select count(*) from profiles where seed_batch_id = {b} and is_founding_member": len(self.people),
            f"select count(*) from profiles p join _keep k on k.id = p.id and k.handle = p.username where p.seed_batch_id = {b}": len(self.people),
            f"select count(*) from auth.users where raw_app_meta_data->>'seed_batch_id' = {b}": len(self.people),
            f"select count(*) from posts where seed_batch_id = {b}": len(self.threads),
            f"select count(*) from replies where seed_batch_id = {b}": n_rep,
            f"select count(*) from mentorships where seed_batch_id = {b}": len(self.ments),
            f"select count(*) from mentorships where seed_batch_id = {b} and status = 'active'": st["active"],
            f"select count(*) from mentorships where seed_batch_id = {b} and status = 'pending'": st["pending"],
            f"select count(*) from mentorships where seed_batch_id = {b} and status = 'declined'": st["declined"],
            f"select count(*) from follows where seed_batch_id = {b}": len(self.follows_rows),
            f"select count(*) from job_collabs where seed_batch_id = {b}": len(self.collabs_rows),
            f"select count(*) from job_collabs where seed_batch_id = {b} and filled_at is not null": len(self.collabs_rows),
            f"select count(*) from collab_interests where seed_batch_id = {b}": n_pitch,
            f"select count(*) from collab_interests where seed_batch_id = {b} and status = 'accepted'": pst["accepted"],
            f"select count(*) from collab_interests where seed_batch_id = {b} and status = 'declined'": pst["declined"],
            f"select count(*) from collab_interests where seed_batch_id = {b} and status = 'interested'": pst["interested"],
            f"select count(*) from replies where seed_batch_id = {b} and is_accepted": sum(r["accepted"] for t in self.threads for r in t["replies"]),
            "select count(*) from notifications": "(select notifications - notifications_rm from _red_before)",
            "select count(*) from posts where seed_batch_id is distinct from " + b: f"(select posts from _red_before) - {LIVE['posts']}",
            "select current_setting('homefixr.seeding') = 'on'": "true",
        }
        if edits:
            expect["select count(*) from replies r join (values " + ", ".join(f"({L(uid(B, 'reply', t, str(i)))}::uuid, {L(new)})" for t, i, _, new in self.reply_edits)
                   + f") v(id, body) on v.id = r.id and v.body = r.body where r.seed_batch_id = {b}"] = len(edits)
        if pedits:
            expect["select count(*) from posts p join (values " + ", ".join(f"({L(uid(B, 'post', t))}::uuid, {L(new)})" for t, _, new in self.body_edits)
                   + f") v(id, body) on v.id = p.id and v.body = p.body where p.seed_batch_id = {b}"] = len(pedits)
        # expect values that are SQL booleans need a numeric compare; turn that one into a count
        expect.pop("select current_setting('homefixr.seeding') = 'on'")
        expect["select count(*) from (select current_setting('homefixr.seeding') s) x where s = 'on'"] = 1
        zero = [
            "select count(*) from profiles where id in (select id from _rm)",
            "select count(*) from auth.users where id in (select id from _rm)",
            "select count(*) from follows where follower_id in (select id from _rm) or following_id in (select id from _rm)",
            f"select count(*) from (select author_id a from posts where seed_batch_id = {b} union all select author_id from replies where seed_batch_id = {b} "
            f"union all select poster_id from job_collabs where seed_batch_id = {b} union all select user_id from collab_interests where seed_batch_id = {b}) x "
            "where x.a not in (select id from _keep)",
            f"select count(*) from replies r left join posts p on p.id = r.post_id where r.seed_batch_id = {b} and (p.id is null or p.seed_batch_id is distinct from {b})",
            f"select count(*) from posts p where p.seed_batch_id = {b} and p.reply_count <> (select count(*) from replies r where r.post_id = p.id)",
            f"select count(*) from (select post_id from replies where seed_batch_id = {b} and is_accepted group by 1 having count(*) > 1) x",
            f"select count(*) from replies where seed_batch_id = {b} and helpful_count < 0",
            f"select count(*) from profiles where seed_batch_id = {b} and role = 'senior' and mentor_availability = 'accepting'",
            f"select count(*) from (select senior_id from mentorships where seed_batch_id = {b} and status = 'active' group by 1 having count(*) > 3) x",
            f"select count(*) from profiles k where k.seed_batch_id = {b} and k.role = 'senior' and not exists "
            f"(select 1 from mentorships m where m.senior_id = k.id and m.status = 'active' and m.seed_batch_id = {b})",
        ] + [q.replace("{b}", b) for q in SOCIAL_ZERO.values()] + [q.replace("{b}", b) for q in COLLAB_ZERO.values()]
        out += _check_block(expect, zero)
        out.append(
            f"select 'example profiles (batch)' t, count(*)::text n from profiles where seed_batch_id = {b} "
            f"union all select 'mentors / apprentices', (count(*) filter (where role = 'senior'))::text || ' / ' || (count(*) filter (where role = 'junior'))::text from profiles where seed_batch_id = {b} "
            f"union all select 'threads (batch)', count(*)::text from posts where seed_batch_id = {b} "
            f"union all select 'replies (batch)', count(*)::text from replies where seed_batch_id = {b} "
            f"union all select 'mentorships active / pending', (count(*) filter (where status = 'active'))::text || ' / ' || (count(*) filter (where status = 'pending'))::text "
            f"from mentorships where seed_batch_id = {b} "
            f"union all select 'follows (batch)', count(*)::text from follows where seed_batch_id = {b} "
            f"union all select 'collabs / pitches (batch)', (select count(*) from job_collabs where seed_batch_id = {b})::text || ' / ' || "
            f"(select count(*) from collab_interests where seed_batch_id = {b})::text "
            "union all select 'REPORTED: ' || item, count(*)::text || ': ' || string_agg(who || ' -> ' || target, '; ' order by at) from _red_report group by item "
            "union all select 'notifications removed with the accounts', (select notifications_rm from _red_before)::text "
            "union all select 'notifications now', count(*)::text from notifications;"
        )
        out.append("commit;")
        return "\n".join(out) + "\n"

    # ---------------------------------------------------------------- log
    def edit_log(self) -> str:
        n_lost_rep = sum(len(t["_lost"]) for t in self.threads)
        lines = [
            "# Reduce edits: batch fm-2026-10, 136 -> 29 accounts",
            "",
            "Generated by `seed/scripts/reduce_cast.py` from `seed/content/reduce/{plan,repairs}.yaml` and the live files in",
            "`seed/content/full-136/`. Reply numbers (`r5`) are the reply's index in the FULL thread, which is also its",
            "database id (`uid(batch, 'reply', thread, r)`). Every change here is applied to production by",
            "`seed/out/reduce-cast-fm-2026-10.sql`.",
            "",
            "## Totals",
            "",
            f"- Kept threads: {len(self.threads)} of {len(self.threads_full['threads'])}; they lost {n_lost_rep} replies by removed accounts "
            f"({len(self.lost_threads)} threads lost at least one).",
            f"- Threads repaired (edited, a reply dropped, or the accepted answer changed): {len(self.repairs)}; "
            f"{len(self.reply_edits)} reply edits, {len(self.body_edits)} thread-body edits, {len(self.dropped_replies)} kept replies dropped, "
            f"{len(self.accepted_changes)} accepted flags changed, {len(self.helpful_changes)} helpful counts moved.",
            f"- Threads that lost replies and read fine without them (checked, not edited): {len(self.unedited_lost)}: "
            + ", ".join(self.unedited_lost),
            "",
            "## Who stays",
            "",
            "Apprentices: the 20 busiest by posts + replies in the full thread set (ties broken by handle):",
            "",
            "| # | handle | posts |",
            "|---|---|---|",
        ]
        for i, (h, n) in enumerate(self.top20, 1):
            lines.append(f"| {i} | {h}{' (first one out)' if i == 21 else ''} | {n} |")
        lines += ["", "## Thread edits", ""]
        for t in self.threads:
            items = self.log.get(t["id"])
            if not items:
                continue
            lost = ", ".join(f"r{i} {a}" for i, a in t["_lost"]) or "none"
            lines.append(f"### {t['id']}: {t['title']}")
            lines.append("")
            lines.append(f"Started by {t['author']}{' (live sample thread)' if t.get('live') else ''}. Removed replies: {lost}.")
            lines.append("")
            for e in items:
                if e["kind"] == "edit":
                    lines.append(f"- **edit r{e['r']}** ({e['author']}): {e['why']}")
                    lines.append(f"  - was: {e['old']!r}")
                    lines.append(f"  - now: {e['new']!r}")
                elif e["kind"] == "body":
                    lines.append(f"- **edit thread body** ({t['author']}): {e['why']}")
                    lines.append(f"  - was: {e['old']!r}")
                    lines.append(f"  - now: {e['new']!r}")
                elif e["kind"] == "drop":
                    lines.append(f"- **drop r{e['r']}** ({e['author']}): {e['why']}")
                    lines.append(f"  - was: {e['old']!r}")
                elif e["kind"] == "accepted":
                    who = f"r{e['r']} ({e['author']})" if e["r"] is not None else "none"
                    lost_acc = ", ".join(f"r{i} {a}" for i, a in e["lost"]) or "kept"
                    lines.append(f"- **accepted answer -> {who}** (was: {lost_acc}): {e['why']}")
                elif e["kind"] == "helpful":
                    lines.append(f"- helpful r{e['r']} ({e['author']}): {e['old']} -> {e['new']} ({e['why']})")
            lines.append("")
        lines += ["## Mentorships", "", "Kept as they were (both people stay):", ""]
        for j, s in self.ment_kept_ids:
            m = next(x for x in self.ments if x["junior"] == j and x["senior"] == s)
            lines.append(f"- {j} -> {s}: {m['status']}")
        lines += ["", "Status changes:", ""]
        for j, s, old, new in self.ment_status_changes:
            lines.append(f"- {j} -> {s}: {old} -> {new}")
        lines += ["", "New:", ""]
        for m in self.ment_new:
            lines.append(f"- {m['junior']} -> {m['senior']} ({m['status']}, requested {m['requested_at'][:16]}Z): {m['why']}")
        lines += ["", f"All other {LIVE['mentorships'] - len(self.ment_kept_ids)} mentorships involved a removed account and are deleted.", ""]
        lines += ["## Follows", "", f"{len(self.follows_rows) - len(self.follow_new)} follows between kept accounts stay; "
                  f"{LIVE['follows'] - (len(self.follows_rows) - len(self.follow_new))} go. Added:", ""]
        for f in self.follow_new:
            lines.append(f"- {f['follower']} -> {f['following']} ({f['created_at'][:16]}Z): {f['why']}")
        lines += ["", "## Ride-alongs (collabs)", "", "Dropped: " + ", ".join(
            f"{c['id']} ({c['poster']}{', poster removed' if c['poster'] not in self.keep else ''})" for c in self.collabs_dropped), ""]
        lines.append("Pitch status changes:")
        lines.append("")
        for cid, ap, old, new, why in self.pitch_status_changes:
            lines.append(f"- {cid} {ap}: {old} -> {new}. {why}")
        lines += ["", "New pitches (in the applicant's voice):", ""]
        for cid, x, why in self.pitch_new:
            lines.append(f"- {cid} {x['applicant']} ({x['status']}): {why}")
            lines.append(f"  - note: {x['note']!r}")
        lines.append("")
        return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="build and validate, write nothing")
    args = ap.parse_args()
    red = Reduced()
    content = red.content()
    sql = red.sql()
    log = red.edit_log()
    st = Counter(m["status"] for m in red.ments)
    print(f"cast {len(red.people)} ({sum(p['role'] == 'senior' for p in red.people)} mentors); threads {len(red.threads)}; "
          f"replies {sum(len(t['replies']) for t in red.threads)}; mentorships {dict(st)}; follows {len(red.follows_rows)}; "
          f"collabs {len(red.collabs_rows)} / pitches {sum(len(c['pitches']) for c in red.collabs_rows)}; "
          f"repaired threads {len(red.repairs)} (lost replies: {len(red.lost_threads)})")
    if args.check:
        return
    for rel, data in content.items():
        jdump(SEED_DIR / rel, data)
    SQL_OUT.parent.mkdir(parents=True, exist_ok=True)
    SQL_OUT.write_text(sql)
    LOG_OUT.write_text(log)
    print(f"wrote {len(content)} content files, {SQL_OUT.relative_to(SEED_DIR.parent)}, {LOG_OUT.relative_to(SEED_DIR.parent)}")


if __name__ == "__main__":
    main()
