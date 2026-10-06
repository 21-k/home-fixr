# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""
Timestamp distribution (plan §6). Library + CLI.

    uv run seed/scripts/schedule.py            # schedule the sample threads
    uv run seed/scripts/schedule.py --plan     # print the day-by-day thread plan

Rules implemented
  * Window: --start .. --end (default 2026-07-24, the site's launch, ..
    2026-10-04, America/New_York). Nothing seeded predates the launch.
  * Joins: 136 accounts, front-loaded in July/August, clustered around a few
    "moments" (founding week, mid-summer, application season, school starts,
    late September), Seniors in the first days.
  * Thread volume follows an explicit day-by-day plan (daily_plan), not an
    even spread: 1-2 a day after launch (the odd empty day), 3-4 a day from
    Aug 7, a late-August lull (Aug 24-26 blank), a weekend spike Aug 29-30,
    then a slow climb through September (~2-3 a day rising to ~5-6, Sundays
    up, Fridays/Saturdays down, Labor Day quiet). A subset (e.g. the 20-thread
    sample) takes evenly spaced slots from that plan so it keeps the shape.
  * Posting rhythm: evenings 6-11pm and early mornings 5-6:30am, a weekday
    lunch spike 12-1; Sundays busy, Saturdays quiet, Friday nights dead.
  * HVAC bump on hot stretches. The dates below are PLACEHOLDERS: the plan
    asks for real 2026 heat waves from a weather archive, which was not
    checked in this pass (see REPORT.md open questions).
  * Replies: first reply 20 min - 6 h after the post; Seniors mostly reply in
    the evening; an occasional long-tail reply up to ~9 days later.
  * Everything is computed in America/New_York and written as UTC ISO strings.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
import sys
from collections import Counter
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).parent))
from common import RNG_SEED, SEED_DIR, load_json, write_json  # noqa: E402

NY = ZoneInfo("America/New_York")
DEFAULT_START = date(2026, 7, 24)  # site launch
DEFAULT_END = date(2026, 10, 4)
# PLACEHOLDER heat stretches (unverified; replace with real 2026 dates).
HEAT_STRETCHES = [(date(2026, 7, 27), date(2026, 7, 29)), (date(2026, 8, 10), date(2026, 8, 13))]

# Phase boundaries for daily_plan (absolute dates, America/New_York).
SETTLED_FROM = date(2026, 8, 7)     # 1-2/day before this, 3-4/day after
LULL = (date(2026, 8, 24), date(2026, 8, 26))
SPIKE = {date(2026, 8, 29): 5, date(2026, 8, 30): 9}
SEPTEMBER_FROM = date(2026, 8, 31)  # slow climb from here to the end
LABOR_DAY = date(2026, 9, 7)

# Relative weight of each hour, by day-of-week (Mon=0 .. Sun=6).
_WEEKDAY_HOURS = {5: 3, 6: 2, 7: 0.5, 12: 2.5, 13: 1, 17: 0.8, 18: 2, 19: 3, 20: 3.5, 21: 3, 22: 2, 23: 0.6}
_SATURDAY_HOURS = {8: 0.6, 9: 0.8, 10: 0.8, 11: 0.6, 14: 0.4, 19: 0.6, 20: 0.7, 21: 0.6}
_SUNDAY_HOURS = {8: 1, 9: 1.5, 10: 2, 11: 2, 12: 1.5, 13: 1.2, 14: 1, 15: 1, 16: 1, 19: 2.5, 20: 3, 21: 3, 22: 1.5}
_FRIDAY_HOURS = {5: 3, 6: 2, 12: 2.5, 13: 1, 17: 0.5, 18: 0.4}  # Friday nights dead
_SENIOR_REPLY_HOURS = {6: 0.6, 12: 0.8, 18: 1.5, 19: 3, 20: 3.5, 21: 3, 22: 1.5}


def _hours_for(d: date) -> dict[int, float]:
    wd = d.weekday()
    return {4: _FRIDAY_HOURS, 5: _SATURDAY_HOURS, 6: _SUNDAY_HOURS}.get(wd, _WEEKDAY_HOURS)


def _pick(rng: random.Random, weights: dict) -> object:
    keys = list(weights)
    return rng.choices(keys, weights=[weights[k] for k in keys])[0]


def _rng(*parts) -> random.Random:
    h = hashlib.sha256(("|".join(map(str, (RNG_SEED,) + parts))).encode()).hexdigest()
    return random.Random(int(h[:16], 16))


def to_utc_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def daily_plan(start: date = DEFAULT_START, end: date = DEFAULT_END) -> dict[date, int]:
    """How many new threads start on each day: a ramp, not an even spread."""
    plan: dict[date, int] = {}
    climb_days = max(1, (end - SEPTEMBER_FROM).days)
    for i in range((end - start).days + 1):
        d = start + timedelta(days=i)
        rng = _rng("day", d.isoformat())
        wd = d.weekday()
        if d < SETTLED_FROM:  # launch weeks: 1-2 a day, the odd empty day
            n = 0 if rng.random() < 0.15 else rng.choice([1, 1, 2])
            if wd == 6:
                n = rng.choice([2, 3])
        elif d < LULL[0]:  # settling in: 3-4 a day
            n = {4: 2, 5: rng.choice([1, 2]), 6: rng.choice([4, 5])}.get(wd, rng.choice([3, 4]))
        elif d <= LULL[1]:  # late-August vacations
            n = 0
        elif d in SPIKE:
            n = SPIKE[d]
        elif d < SEPTEMBER_FROM:
            n = rng.choice([1, 2])
        else:  # slow climb through September
            base = 2.5 + 3.0 * (d - SEPTEMBER_FROM).days / climb_days
            factor = 0.3 if d == LABOR_DAY else {4: 0.7, 5: 0.5, 6: 1.4}.get(wd, 1.0)
            n = max(0, round(base * factor + rng.uniform(-1, 1)))
        plan[d] = n
    return plan


def plan_slots(plan: dict[date, int], n: int) -> list[date]:
    """n evenly spaced slots from the plan, so a subset keeps the plan's shape."""
    slots = [d for d in sorted(plan) for _ in range(plan[d])]
    if n >= len(slots):
        return slots + [slots[-1]] * (n - len(slots))
    return [slots[int((i + 0.5) * len(slots) / n)] for i in range(n)]


class Scheduler:
    def __init__(self, start: date = DEFAULT_START, end: date = DEFAULT_END):
        self.start, self.end = start, end
        self.days = [start + timedelta(days=i) for i in range((end - start).days + 1)]

    # -------------------------------------------------------------- helpers
    def at(self, d: date, hour: int, rng: random.Random) -> datetime:
        minute = rng.randint(0, 59) if hour != 5 else rng.randint(0, 59)
        if hour == 6:
            minute = rng.randint(0, 30)  # 5:00-6:30 commute window
        return datetime.combine(d, time(hour, minute, rng.randint(0, 59)), NY)

    def end_dt(self) -> datetime:
        return datetime.combine(self.end, time(23, 59, 0), NY)

    def _clamp(self, dt: datetime) -> datetime:
        return min(dt, self.end_dt())

    # ---------------------------------------------------------------- joins
    def join_times(self, people: list[dict]) -> dict[str, datetime]:
        """people: dicts with slot_id and role. Seniors first week; juniors clustered."""
        n_days = len(self.days)
        # Cluster centres as fractions of the window, with weights. Front-loaded.
        moments = [(0.02, 0.30, 3), (0.20, 0.22, 4), (0.37, 0.20, 4), (0.68, 0.18, 4), (0.86, 0.10, 3)]
        out = {}
        for p in people:
            rng = _rng("join", p["slot_id"])
            if p["role"] == "senior":
                d = self.days[min(rng.randint(0, 9), n_days - 1)]
            else:
                centre, _w, spread = rng.choices(moments, weights=[m[1] for m in moments])[0]
                idx = int(round(centre * (n_days - 1) + rng.gauss(0, spread)))
                d = self.days[max(0, min(n_days - 1, idx))]
            hour = _pick(rng, _hours_for(d))
            out[p["slot_id"]] = self.at(d, hour, rng)
        return out

    # -------------------------------------------------------------- threads
    def thread_time_on(self, key: str, d: date, not_before: datetime) -> datetime:
        """A post time on day `d` (or the next day it fits) after `not_before`."""
        rng = _rng("thread", key)
        for day in (d, d + timedelta(days=1), d + timedelta(days=2)):
            for _ in range(20):
                dt = self.at(day, _pick(rng, _hours_for(day)), rng)
                if dt > not_before:
                    return self._clamp(dt)
        return self._clamp(not_before + timedelta(hours=2))

    def reply_times(self, key: str, post_at: datetime, repliers: list[dict]) -> list[datetime]:
        """repliers: [{role, not_before}] in thread order. Returns ascending times."""
        rng = _rng("replies", key)
        out: list[datetime] = []
        prev = post_at
        for i, r in enumerate(repliers):
            if i == 0:
                gap = timedelta(minutes=rng.uniform(20, 360))
            elif rng.random() < 0.06:
                gap = timedelta(days=rng.uniform(3, 9))  # long tail
            else:
                gap = timedelta(minutes=rng.expovariate(1 / 150) + 5)
            t = prev + gap
            if r["role"] == "senior" and t.astimezone(NY).hour < 17 and rng.random() < 0.7:
                # Seniors mostly answer in the evening.
                d = t.astimezone(NY).date()
                t = self.at(d, _pick(rng, _SENIOR_REPLY_HOURS), rng)
                if t <= prev:
                    t = self.at(d + timedelta(days=1), _pick(rng, _SENIOR_REPLY_HOURS), rng)
            t = max(t, r["not_before"] + timedelta(minutes=5))
            local = t.astimezone(NY)
            if local.hour < 5:
                # Nobody's posting at 3am: slide to the morning commute window.
                t = self.at(local.date(), _pick(rng, {5: 3, 6: 2}), rng)
            local = t.astimezone(NY)
            if local.weekday() == 4 and local.hour >= 18:
                # Friday nights are dead: the reply lands Saturday morning or Sunday evening.
                if rng.random() < 0.6:
                    t = self.at(local.date() + timedelta(days=2), _pick(rng, _SUNDAY_HOURS), rng)
                else:
                    t = self.at(local.date() + timedelta(days=1), _pick(rng, {8: 1, 9: 1, 10: 1, 11: 1}), rng)
            if i == 0:
                t = max(t, post_at + timedelta(minutes=20))  # first reply >= 20 min
            t = self._clamp(t)
            if t <= prev:
                t = prev + timedelta(minutes=rng.randint(3, 40))
                if t > self.end_dt():
                    # Bunched up against the end of the window: split the gap
                    # that's left instead of spilling past it.
                    t = prev + max((self.end_dt() - prev) / 2, timedelta(seconds=30))
            out.append(t)
            prev = t
        return out


def hour_histogram(times: list[datetime]) -> dict[int, int]:
    c = Counter(t.astimezone(NY).hour for t in times)
    return {h: c.get(h, 0) for h in range(24)}


def schedule_threads(threads: list[dict], personas: dict[str, dict], sch: Scheduler) -> list[dict]:
    """Adds created_at (UTC ISO) to each thread and reply, in place, and returns them.

    Threads take slots from daily_plan in chronological order. Each slot goes
    to a (deterministically shuffled) thread whose whole cast has joined by
    then, preferring HVAC threads on hot days; a thread nobody can take yet
    waits for the first day its cast exists."""
    def ready(t: dict) -> datetime:
        # The whole cast must exist before the thread starts.
        cast = [personas[t["author"]]] + [personas[r["author"]] for r in t.get("replies", [])]
        return max(datetime.fromisoformat(p["joined_at"]) for p in cast) + timedelta(hours=1)

    remaining = list(threads)
    _rng("order").shuffle(remaining)
    placed: list[tuple[dict, date]] = []
    for d in plan_slots(daily_plan(sch.start, sch.end), len(threads)):
        day_end = datetime.combine(d, time(23, 0), NY)
        eligible = [t for t in remaining if ready(t) < day_end]
        if any(a <= d <= b for a, b in HEAT_STRETCHES):
            eligible.sort(key=lambda t: t.get("trade") != "hvac")
        pick = eligible[0] if eligible else min(remaining, key=ready)
        remaining.remove(pick)
        placed.append((pick, max(d, ready(pick).astimezone(NY).date())))

    for t, d in placed:
        post_at = sch.thread_time_on(t["id"], d, ready(t))
        replies = t.get("replies", [])
        rts = sch.reply_times(
            t["id"],
            post_at,
            [{"role": personas[r["author"]]["role"], "not_before": datetime.fromisoformat(personas[r["author"]]["joined_at"])} for r in replies],
        )
        t["created_at"] = to_utc_iso(post_at)
        for r, rt in zip(replies, rts):
            r["created_at"] = to_utc_iso(rt)
    return threads


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", type=date.fromisoformat, default=DEFAULT_START)
    ap.add_argument("--end", type=date.fromisoformat, default=DEFAULT_END)
    ap.add_argument("--threads", default="content/threads.sample.json")
    ap.add_argument("--out", default="content/threads.sample.scheduled.json")
    ap.add_argument("--plan", action="store_true", help="print the day-by-day thread plan and exit")
    args = ap.parse_args()

    if args.plan:
        plan = daily_plan(args.start, args.end)
        for d, n in plan.items():
            print(f"{d:%a %b %d}  {n:2d}  {'#' * n}")
        print(f"total threads in plan: {sum(plan.values())}")
        return

    sch = Scheduler(args.start, args.end)
    personas = {p["handle"]: p for p in load_json("personas/seniors.json") + load_json("personas/juniors.json")}
    threads = load_json(args.threads)["threads"]
    schedule_threads(threads, personas, sch)
    write_json(args.out, {"window": [str(args.start), str(args.end)], "threads": threads})

    times = [datetime.fromisoformat(t["created_at"]) for t in threads]
    times += [datetime.fromisoformat(r["created_at"]) for t in threads for r in t.get("replies", [])]
    hist = hour_histogram(times)
    print(f"scheduled {len(threads)} threads -> {SEED_DIR / args.out}")
    print("posting hours (ET):", " ".join(f"{h}:{c}" for h, c in hist.items() if c))


if __name__ == "__main__":
    main()
