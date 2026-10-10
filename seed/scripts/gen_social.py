# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""
The social layer of the Founding Community seed: mentorships + follows.

    uv run seed/scripts/gen_social.py            # writes content/mentorships.json + content/follows.json
    uv run seed/scripts/gen_social.py --summary  # also prints the per-Senior table

Inputs: personas/seniors.json, personas/juniors.json and the scheduled sample
threads (content/threads.sample.scheduled.json). Deterministic: one RNG seeded
from common.RNG_SEED, inputs walked in sorted order, so the same inputs always
give the same graph. Nothing here touches a database.

MENTORSHIPS (plan §4: ~35, ~60% accepted, some pending, a few declined)
  * Seniors carry a hand-set number of ACTIVE mentees (ACTIVE_MENTEES): three
    pillars with 3-5, several with 1-2, the rest 0. The two "not_accepting"
    Seniors with mentees are full, which is why they say so.
  * Pairs the threads already imply come first (ANCHORS): a Junior thanking a
    Senior, or "update: did what Joy said". The content and the graph agree.
  * The rest are drawn: Juniors weighted by path (career switchers and vo-tech
    grads/students lean in, union apprentices have the JATC) and by activity
    (lurkers rarely ask); Seniors matched mostly by trade, then region; NYC
    Juniors mostly to the two NYC Seniors; a thread interaction boosts a pair.
  * No Junior has two active mentors. A second, pending request happens once
    or twice. Pending requests go mostly to "limited" Seniors and are recent.
  * The table only stores created_at, so created_at = the request time. The
    accept/decline time is kept here (decided_at) for QA: hours to days later.
  * Declined rows are never shown publicly (the app only counts `active`, and
    mentorships are readable only by the two people involved).

FOLLOWS (a skewed graph)
  * ~20% of accounts follow nobody (mostly lurkers).
  * Every mentee follows their mentor; most pending requesters follow too.
  * Juniors follow the Seniors who answered their threads, usually soon after
    the reply; Seniors who argued in the same thread follow each other.
  * The rest by popularity x trade x region (pillars draw from everywhere,
    everyone else mostly from their own trade and region).
  * In-degree is then held to the target bands: pillars 15-40, other Seniors
    5-15, active Juniors 0-8, occasional 0-5, lurkers 0-3 (mostly 0-2).
  * A follow is never before both people joined, never after the window end.
"""
from __future__ import annotations

import argparse
import math
import random
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from common import BATCH_ID, RNG_SEED, load_json, write_json  # noqa: E402
from schedule import (  # noqa: E402
    _SENIOR_REPLY_HOURS,
    DEFAULT_END,
    DEFAULT_START,
    NY,
    Scheduler,
    _hours_for,
    _pick,
    to_utc_iso,
)

# Active mentees each Senior carries (sum 22 of ~36 rows = 61%).
ACTIVE_MENTEES = {
    "ms_almonte": 5,      # vo-tech instructor: mentoring is half her job
    "oldsteam_zig": 4,    # pillar, answers everything
    "Kash_sing": 3,       # pillar, likes the business side
    "mbell_wireman": 2,
    "joyd_plumbing": 2,   # both from the threads (T03, T09)
    "bklyn_arkady": 2,    # NYC plumbing Juniors
    "dreb_jman": 2,       # not_accepting: full
    "codebook_dale": 1,   # not_accepting: one he took before he got busy
    "thiago_sparks": 1,
}
TARGET_PENDING = 11
TARGET_DECLINED = 3  # all drawn; the threads imply none

# Pairs the sample threads imply. (thread, junior, senior, status, why)
ANCHORS = [
    ("T01", "threeway_02", "mbell_wireman", "active", "thanked Marcus's accepted answer, called two shops"),
    ("T02", "Edison.volts", "thiago_sparks", "active", "update: hired at a non-union shop, as Thiago suggested"),
    ("T03", "TryingAllThree", "joyd_plumbing", "active", "took Joy's ride-along idea"),
    ("T09", "Kearny_Pipefitter", "joyd_plumbing", "active", "update: did the fittings 'like Joy said'"),
    ("T15", "Exit117Plumber", "oldsteam_zig", "active", "back-and-forth with Ziggy found the weeping valve"),
    ("T19", "ExRetail_NowHVAC", "ms_almonte", "active", "Rosa answered him in T06 and congratulated him in T19"),
    ("T04", "Flushing.sparks", "dreb_jman", "active", "accepted answer on the Local 3 question (NYC)"),
    ("T10", "Dev_H", "rui_t_kearny", "pending", "'Appreciate it' to Rui's accepted answer; Deptford to Kearny, still pending"),
    # Thanked Dale and Thiago; Dale is "not taking mentees" (the app hides the
    # request button), so he asked Thiago, from his own county.
    ("T07", "LiveFrontLessons", "thiago_sparks", "pending", "'thanks both'; Dale isn't taking mentees, so he asked Thiago (same county)"),
    ("T16", "epa60812_2", "hec_does_ac", "pending", "'ok that actually makes sense' to Hector's accepted answer"),
]

PATH_W = {"career_switcher": 2.6, "votech_grad": 2.1, "votech_student": 1.9, "nonunion_apprentice": 1.0,
          "service_tech": 0.7, "union_apprentice": 0.45}
ACT_W = {"heavy": 3.2, "regular": 2.2, "occasional": 0.8, "lurker": 0.1}
# Seniors whose work spans two trades (plan roster #9 teaches plumbing/HVAC,
# #11 is a mechanical contractor doing HVAC + plumbing).
# Weight of the second trade in a mentor match (own trade = 4.0).
SENIOR_TRADES = {"ms_almonte": {"plumbing": 1.2}, "haddad_mech": {"plumbing": 2.5}}
NJ_ORDER = {"NJ-North": 0, "NJ-Central": 1, "NJ-South": 2}

# Follower bands by account type: (min, max).
BANDS = {"pillar": (15, 40), "senior": (5, 15), "heavy": (0, 8), "regular": (0, 8), "occasional": (0, 5), "lurker": (0, 3)}
ZERO_OUT_SHARE = 0.20
# How attractive an account is to follow, by kind (x visibility in the threads).
POP = {"pillar": 2.6, "senior": 0.9, "heavy": 1.1, "regular": 0.5, "occasional": 0.1, "lurker": 0.025}
# Seniors follow other Seniors and the occasional standout (heavy) Junior;
# a regular Junior only after a thread exchange.
POP_BY_SENIOR = {"pillar": 4.0, "senior": 2.0, "heavy": 0.6, "regular": 0.0, "occasional": 0.0, "lurker": 0.0}


def kind(p: dict) -> str:
    if p["role"] == "senior":
        return "pillar" if p["activity_level"] == "heavy" else "senior"
    return p["activity_level"]


def region_w(a: dict, b: dict, nyc_same: float = 2.5, nyc_cross: float = 0.3) -> float:
    ra, rb = a["region"], b["region"]
    if ra == rb:
        return nyc_same if ra == "NYC" else 2.0
    if "NYC" in (ra, rb):
        return nyc_cross
    return 1.0 if abs(NJ_ORDER[ra] - NJ_ORDER[rb]) == 1 else 0.55


def trade_w(a: dict, b: dict, same: float = 3.0, cross: float = 0.6) -> float:
    if a["trade"] == b["trade"]:
        return same
    if "general" in (a["trade"], b["trade"]):
        return 1.0
    return cross


class Social:
    def __init__(self, seniors: list[dict], juniors: list[dict], threads: list[dict]):
        self.rng = random.Random(RNG_SEED + 29)
        self.sch = Scheduler(DEFAULT_START, DEFAULT_END)
        self.end = self.sch.end_dt()
        self.people = {p["handle"]: p for p in seniors + juniors}
        self.seniors = sorted(seniors, key=lambda p: p["slot_id"])
        self.juniors = sorted(juniors, key=lambda p: p["slot_id"])
        self.joined = {h: datetime.fromisoformat(p["joined_at"]) for h, p in self.people.items()}
        self.threads = threads
        self._interactions()

    # ------------------------------------------------------------ helpers
    def place(self, not_before: datetime, target: datetime, hours=None) -> datetime:
        """A time near `target` that fits the posting rhythm, in [not_before, end]."""
        target = min(max(target, not_before), self.end)
        day = target.astimezone(NY).date()
        for k in range(4):
            d = day + timedelta(days=k)
            for _ in range(8):
                dt = self.sch.at(d, _pick(self.rng, hours or _hours_for(d)), self.rng)
                if not_before < dt <= self.end:
                    return dt
        t = not_before + timedelta(minutes=self.rng.randint(5, 50))
        return t if t <= self.end else not_before + (self.end - not_before) * self.rng.uniform(0.3, 0.9)

    def lognormal_td(self, median_h: float, sigma: float, lo_h: float, hi_h: float) -> timedelta:
        h = math.exp(math.log(median_h) + self.rng.gauss(0, sigma))
        return timedelta(hours=max(lo_h, min(hi_h, h)))

    def _interactions(self) -> None:
        """Who answered whom, and when, from the sample threads."""
        self.answered: dict[tuple[str, str], tuple[datetime, bool]] = {}   # (starter, replier) -> (first reply time, accepted)
        self.cothread: dict[tuple[str, str], datetime] = {}               # (a, b) both replied -> later time
        self.reply_n = Counter()
        for t in self.threads:
            starter = t["author"]
            seen: dict[str, datetime] = {starter: datetime.fromisoformat(t["created_at"])}
            for r in t.get("replies", []):
                a, at = r["author"], datetime.fromisoformat(r["created_at"])
                self.reply_n[a] += 1
                if a != starter:
                    key = (starter, a)
                    prev = self.answered.get(key)
                    if not prev or r["accepted"]:
                        self.answered[key] = (prev[0] if prev else at, bool(r["accepted"]) or bool(prev and prev[1]))
                for b, bt in seen.items():
                    if b != a and b != starter:
                        for k in ((a, b), (b, a)):
                            self.cothread.setdefault(k, max(at, bt))
                seen.setdefault(a, at)

    def last_reply_between(self, a: str, b: str) -> datetime:
        out = datetime.min.replace(tzinfo=NY)
        for t in self.threads:
            cast = {t["author"]} | {r["author"] for r in t.get("replies", [])}
            if a in cast and b in cast:
                times = [datetime.fromisoformat(r["created_at"]) for r in t.get("replies", []) if r["author"] in (a, b)]
                out = max([out] + times)
        return out

    # -------------------------------------------------------- mentorships
    def match_w(self, j: dict, s: dict) -> float:
        w = SENIOR_TRADES.get(s["handle"], {}).get(j["trade"]) or trade_w(j, s, same=4.0, cross=0.04)
        if j["region"] == "NYC" or s["region"] == "NYC":
            w *= 6.0 if j["region"] == s["region"] else 0.01
        else:
            w *= region_w(j, s)
        if (j["handle"], s["handle"]) in self.answered:
            w *= 3.0
        elif (j["handle"], s["handle"]) in self.cothread:
            w *= 1.6
        return w

    def propensity(self, j: dict) -> float:
        return PATH_W[j["path"]] * ACT_W[j["activity_level"]]

    def _times(self, j: str, s: str, status: str, anchor_at: datetime | None):
        """(requested_at, decided_at) or None if it can't fit in the window."""
        earliest = max(self.joined[j] + timedelta(days=self.rng.uniform(3, 9)), self.joined[s] + timedelta(days=1))
        # If they've met in a thread, the request comes after that, never before
        # (a mentor answering their own mentee like a stranger reads wrong).
        if (j, s) in self.answered and not anchor_at:
            anchor_at = self.last_reply_between(j, s)
        if anchor_at:
            earliest = max(earliest, anchor_at + timedelta(hours=self.rng.uniform(2, 30)))
        if earliest >= self.end - timedelta(hours=3):
            return None
        latency = self.lognormal_td(18, 0.9, 1, 6 * 24) if status != "pending" else None
        if status == "pending":
            # Pending requests are mostly recent: a few days to a few weeks old.
            back = self.lognormal_td(8 * 24, 0.8, 10, 45 * 24)
            target = max(earliest, self.end - back)
        else:
            delay = self.lognormal_td(30 if anchor_at else 6 * 24, 0.8, 1, 40 * 24)
            target = earliest + delay
            if target + latency > self.end:
                room = (self.end - latency - earliest).total_seconds()
                if room <= 0:
                    return None
                target = earliest + timedelta(seconds=self.rng.uniform(0, room))
        req = self.place(earliest, target)
        if status == "pending":
            return req, None
        dec = self.place(req + timedelta(hours=1), req + latency, _SENIOR_REPLY_HOURS)
        if dec <= req or dec > self.end:
            return None
        return req, dec

    def mentorships(self) -> list[dict]:
        rows: list[dict] = []
        active_of: dict[str, str] = {}
        pairs: set[tuple[str, str]] = set()
        cap = Counter(ACTIVE_MENTEES)
        tmap = {t["id"]: t for t in self.threads}
        anchored = {a[1] for a in ANCHORS}
        MIN_FIT = 1.0  # below this a pairing makes no sense (wrong trade and wrong place)

        def add(j, s, status, req, dec, anchor=None, why=""):
            rows.append({"junior": j, "senior": s, "status": status, "requested_at": to_utc_iso(req),
                         "decided_at": to_utc_iso(dec) if dec else None, "anchor_thread": anchor, "why": why})
            pairs.add((j, s))
            if status == "active":
                active_of[j] = s
                cap[s] -= 1

        for tid, j, s, status, why in ANCHORS:
            t = tmap[tid]
            js = [datetime.fromisoformat(r["created_at"]) for r in t["replies"] if r["author"] in (j, s)]
            times = self._times(j, s, status, max(js))
            if times is None:
                raise SystemExit(f"anchor {tid} {j}->{s} doesn't fit in the window")
            add(j, s, status, *times, anchor=tid, why=why)

        # Remaining actives: scarcest Senior pools first (NYC, then by remaining capacity).
        order = sorted((s for s in self.seniors if cap[s["handle"]] > 0),
                       key=lambda s: (s["region"] != "NYC", -cap[s["handle"]], s["slot_id"]))
        for s in order:
            while cap[s["handle"]] > 0:
                pool = [j for j in self.juniors if j["handle"] not in active_of and j["handle"] not in anchored
                        and (j["handle"], s["handle"]) not in pairs and self.match_w(j, s) >= MIN_FIT
                        and self.joined[j["handle"]] < self.end - timedelta(days=12)]
                w = [self.propensity(j) * self.match_w(j, s) for j in pool]
                j = self.rng.choices(pool, weights=w)[0]
                times = self._times(j["handle"], s["handle"], "active", None)
                if times:
                    add(j["handle"], s["handle"], "active", *times, why="drawn: trade/region/path/activity")

        # Pending: mostly to "limited" Seniors; Juniors without a mentor, rarely one who has one.
        def senior_w_pending(j, s):
            # The app hides the request button on "not taking mentees" profiles.
            avail = 1.0 if s["mentor_availability"] == "limited" else 0.0
            pop = 1.6 if kind(s) == "pillar" else 1.0
            return avail * pop * self.match_w(j, s)

        n_second = sum(1 for r in rows if r["status"] == "pending" and r["junior"] in active_of)
        while sum(r["status"] == "pending" for r in rows) < TARGET_PENDING:
            allow_second = n_second < 1 and self.rng.random() < 0.15
            pool = [j for j in self.juniors if (allow_second or j["handle"] not in active_of) and j["handle"] not in anchored
                    and not any(r["junior"] == j["handle"] and r["status"] == "pending" for r in rows)
                    and self.joined[j["handle"]] < self.end - timedelta(days=4)]
            j = self.rng.choices(pool, weights=[self.propensity(x) for x in pool])[0]
            cands = [s for s in self.seniors if (j["handle"], s["handle"]) not in pairs and active_of.get(j["handle"]) != s["handle"]
                     and self.match_w(j, s) >= MIN_FIT and senior_w_pending(j, s) > 0]
            if not cands:
                continue  # nobody sensible to ask
            s = self.rng.choices(cands, weights=[senior_w_pending(j, x) for x in cands])[0]
            times = self._times(j["handle"], s["handle"], "pending", None)
            if times:
                if j["handle"] in active_of:
                    n_second += 1
                add(j["handle"], s["handle"], "pending", *times, why="drawn: request not answered yet")

        # Declined: Seniors who are full or not taking anyone.
        def senior_w_declined(j, s):
            # Only someone you could ask can say no: "limited" Seniors, mostly the full ones.
            if s["mentor_availability"] != "limited":
                return 0.0
            full = cap[s["handle"]] <= 0 and ACTIVE_MENTEES.get(s["handle"], 0) >= 3
            return (3.0 if full else 0.4) * self.match_w(j, s)

        while sum(r["status"] == "declined" for r in rows) < TARGET_DECLINED:
            pool = [j for j in self.juniors if j["handle"] not in anchored and self.joined[j["handle"]] < self.end - timedelta(days=10)]
            j = self.rng.choices(pool, weights=[self.propensity(x) for x in pool])[0]
            cands = [s for s in self.seniors if (j["handle"], s["handle"]) not in pairs and active_of.get(j["handle"]) != s["handle"]
                     and self.match_w(j, s) >= MIN_FIT and senior_w_declined(j, s) > 0]
            if not cands:
                continue
            s = self.rng.choices(cands, weights=[senior_w_declined(j, x) for x in cands])[0]
            times = self._times(j["handle"], s["handle"], "declined", None)
            if not times:
                continue
            # A Junior who already has a mentor wouldn't have been asking around afterwards.
            if j["handle"] in active_of:
                act = next(r for r in rows if r["junior"] == j["handle"] and r["status"] == "active")
                if times[0] > datetime.fromisoformat(act["requested_at"]):
                    continue
            add(j["handle"], s["handle"], "declined", *times, why="drawn: Senior full / not taking mentees")

        rows.sort(key=lambda r: r["requested_at"])
        self.rows = rows
        return rows

    # ------------------------------------------------------------ follows
    def follows(self) -> list[dict]:
        rng = self.rng
        people = [self.people[p["handle"]] for p in self.seniors + self.juniors]
        H = [p["handle"] for p in people]
        active = {(r["junior"], r["senior"]): r for r in self.rows if r["status"] == "active"}
        mentee_of = {j: s for (j, s) in active}
        edges: dict[tuple[str, str], dict] = {}
        required: set[tuple[str, str]] = set()

        # 1. Who follows nobody (~20%). Mentees and anchor Juniors always follow someone.
        must_follow = set(mentee_of) | {a[1] for a in ANCHORS}
        zero_w = {"lurker": 3.0, "occasional": 1.0, "regular": 0.3, "heavy": 0.05, "senior": 0.35, "pillar": 0.05}
        cand = [h for h in H if h not in must_follow]
        n_zero = round(ZERO_OUT_SHARE * len(H))
        zero: set[str] = set()
        while len(zero) < n_zero:
            left = [h for h in cand if h not in zero]
            zero.add(rng.choices(left, weights=[zero_w[kind(self.people[h])] for h in left])[0])
        self.zero = zero

        def add(a, b, at, why, req=False, after=None):
            if a == b or a in zero or (a, b) in edges:
                return
            lo = max(self.joined[a], self.joined[b]) + timedelta(minutes=10)
            if after:
                lo = max(lo, after + timedelta(minutes=2))  # never before the reply that prompted it
            if lo >= self.end:
                return
            at = max(at, lo)
            if at.astimezone(NY).hour < 5:
                # Nobody's on at 3am: it happens on the morning commute instead.
                at = self.place(at, at.astimezone(NY).replace(hour=5, minute=0), {5: 3, 6: 2})
            if at > self.end:
                # Too close to the end of the window: somewhere in what's left, or not at all.
                if self.end - lo < timedelta(minutes=20):
                    return
                at = lo + (self.end - lo) * rng.uniform(0.2, 0.9)
            edges[(a, b)] = {"follower": a, "following": b, "created_at": at, "why": why}
            if req:
                required.add((a, b))

        def generic_time(a, b):
            lo = max(self.joined[a], self.joined[b]) + timedelta(hours=1)
            t = lo + timedelta(days=rng.expovariate(1 / 9))
            if t > self.end:
                t = lo + (self.end - lo) * rng.random()
            return self.place(lo, t)

        # 2. Mentees follow their mentor; most requesters follow the Senior they asked.
        for r in self.rows:
            j, s = r["junior"], r["senior"]
            req = datetime.fromisoformat(r["requested_at"])
            lo = max(self.joined[j], self.joined[s]) + timedelta(minutes=30)
            if r["status"] == "active":
                if rng.random() < 0.6 and req - lo > timedelta(hours=3):
                    at = self.place(lo, req - self.lognormal_td(30, 0.8, 2, 5 * 24))
                    at = min(at, req - timedelta(minutes=5))
                else:
                    dec = datetime.fromisoformat(r["decided_at"])
                    at = self.place(dec, dec + self.lognormal_td(3, 1.0, 0.1, 30))
                add(j, s, at, "mentee follows mentor", req=True)
            elif rng.random() < (0.85 if r["status"] == "pending" else 0.5):
                at = self.place(lo, req - self.lognormal_td(20, 0.8, 1, 4 * 24)) if req - lo > timedelta(hours=2) else req
                add(j, s, min(at, req), f"requested mentorship ({r['status']})")

        # 3. Thread interactions: follow the Seniors who answered you, soon after.
        def senior_may_follow(a, b):
            return a["role"] != "senior" or b["role"] == "senior" or b["activity_level"] in ("heavy", "regular")

        for (starter, replier), (at, accepted) in sorted(self.answered.items()):
            a, b = self.people[starter], self.people[replier]
            if not senior_may_follow(a, b):
                continue
            if b["role"] == "senior":
                p = 0.8 if accepted else 0.5
            else:
                p = 0.12
            if rng.random() < p:
                add(starter, replier, at + self.lognormal_td(3, 1.0, 0.1, 48), "answered their thread", after=at)
        for (x, y), at in sorted(self.cothread.items()):
            a, b = self.people[x], self.people[y]
            if not senior_may_follow(a, b):
                continue
            if a["role"] == "senior" and b["role"] == "senior":
                p = 0.3
            elif b["role"] == "senior":
                p = 0.12
            else:
                p = 0.05
            if rng.random() < p:
                add(x, y, at + self.lognormal_td(6, 1.0, 0.1, 72), "same thread", after=at)

        # 4. Fill out-degrees by popularity x trade x region.
        def pop(b: dict, follower: dict) -> float:
            k = kind(b)
            vis = 1 + 0.12 * self.reply_n[b["handle"]]
            return (POP_BY_SENIOR if follower["role"] == "senior" else POP)[k] * vis

        def want(a: dict) -> int:
            k = kind(a)
            if a["role"] == "senior":
                return rng.randint(2, 6)
            return {"heavy": rng.randint(5, 12), "regular": rng.randint(3, 8), "occasional": rng.randint(1, 5),
                    "lurker": rng.choice([1, 1, 1, 2, 2, 3, 4])}[k]

        def w_ab(a: dict, b: dict) -> float:
            cross = 0.75 if kind(b) == "pillar" else 0.35
            return pop(b, a) * trade_w(a, b, 3.0, cross) * region_w(a, b, 2.5, 0.25 if kind(b) != "pillar" else 0.5)

        for a in people:
            h = a["handle"]
            if h in zero:
                continue
            n = want(a)
            mine = sum(1 for (x, _) in edges if x == h)
            tries = 0
            while mine < n and tries < 50:
                tries += 1
                cands = [b for b in people if b["handle"] != h and (h, b["handle"]) not in edges]
                ws = [w_ab(a, b) for b in cands]
                if not any(ws):
                    break
                b = rng.choices(cands, weights=ws)[0]
                add(h, b["handle"], generic_time(h, b["handle"]), "trade/region")
                mine = sum(1 for (x, _) in edges if x == h)

        # 5. Hold in-degree to the bands.
        def indeg():
            c = Counter(b for (_, b) in edges)
            return {h: c.get(h, 0) for h in H}

        for h in H:
            p = self.people[h]
            lo, hi = BANDS[kind(p)]
            if kind(p) == "lurker" and rng.random() < 0.85:
                hi = 2
            deg = indeg()[h]
            if deg > hi:
                keep = rng.randint(max(lo, hi - (hi - lo) // 3), hi)
                cut = [e for e in edges if e[1] == h and e not in required]
                rng.shuffle(cut)
                for e in cut[: deg - keep]:
                    del edges[e]
            deg = indeg()[h]
            if deg < lo:
                goal = lo + rng.randint(0, 3)
                tries = 0
                while indeg()[h] < goal and tries < 200:
                    tries += 1
                    cands = [a for a in people if a["handle"] not in zero and a["handle"] != h and (a["handle"], h) not in edges
                             and (a["role"] == "junior" or p["role"] == "senior")]
                    a = rng.choices(cands, weights=[trade_w(x, p, 3.0, 0.5) * region_w(x, p, 2.5, 0.3) for x in cands])[0]
                    add(a["handle"], h, generic_time(a["handle"], h), "trade/region")

        out = []
        for (a, b), e in sorted(edges.items(), key=lambda kv: (kv[1]["created_at"], kv[0])):
            out.append({**e, "created_at": to_utc_iso(e["created_at"])})
        self.edges = out
        return out


def summary(soc: Social) -> str:
    rows, edges = soc.rows, soc.edges
    ind = Counter(e["following"] for e in edges)
    outd = Counter(e["follower"] for e in edges)
    lines = ["| handle | availability | active | pending | declined | followers | follows |", "|---|---|---|---|---|---|---|"]
    for s in soc.seniors:
        h = s["handle"]
        c = Counter(r["status"] for r in rows if r["senior"] == h)
        lines.append(f"| {h} | {s['mentor_availability']} | {c['active']} | {c['pending']} | {c['declined']} | {ind[h]} | {outd[h]} |")
    st = Counter(r["status"] for r in rows)
    lines.append("")
    lines.append(f"mentorships {len(rows)}: " + ", ".join(f"{k} {v}" for k, v in sorted(st.items())))
    by_kind: dict[str, list[int]] = defaultdict(list)
    for h, p in soc.people.items():
        by_kind[kind(p)].append(ind[h])
    lines.append(f"follows {len(edges)}; accounts following nobody: {sum(1 for h in soc.people if outd[h] == 0)}/{len(soc.people)}")
    for k in ("pillar", "senior", "heavy", "regular", "occasional", "lurker"):
        v = sorted(by_kind[k])
        lines.append(f"  followers of {k:10s} n={len(v):3d} min {v[0]:2d} median {v[len(v) // 2]:2d} max {v[-1]:2d}")
    return "\n".join(lines)


def build(threads_path: str = "content/threads.sample.scheduled.json") -> Social:
    seniors = load_json("personas/seniors.json")
    juniors = load_json("personas/juniors.json")
    threads = load_json(threads_path)["threads"]
    soc = Social(seniors, juniors, threads)
    soc.mentorships()
    soc.follows()
    return soc


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--threads", default="content/threads.sample.scheduled.json")
    ap.add_argument("--summary", action="store_true")
    args = ap.parse_args()
    soc = build(args.threads)
    meta = {"batch_id": BATCH_ID, "generated_by": "seed/scripts/gen_social.py", "rng_seed": RNG_SEED + 29,
            "window": [str(DEFAULT_START), str(DEFAULT_END)], "threads": args.threads}
    write_json("content/mentorships.json", {**meta, "note": "created_at in the DB = requested_at; decided_at is kept for QA only",
                                            "mentorships": soc.rows})
    write_json("content/follows.json", {**meta, "follows": soc.edges})
    print(f"wrote content/mentorships.json ({len(soc.rows)}) and content/follows.json ({len(soc.edges)})")
    if args.summary:
        print(summary(soc))


if __name__ == "__main__":
    main()
