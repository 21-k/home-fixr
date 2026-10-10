import { test, expect, visit } from "./support/fixtures";
import { profileId, rest, restDelete, restPatch } from "./support/db";
import { USERS, storageStatePath } from "./support/users";

// "Helpful" counts once per member (migration 0014). Before the fix, every
// click added 1. Local only: it votes, then restores the counts and votes.

type Thread = { id: string; slug: string; helpful_count: number };
type Reply = { id: string; helpful_count: number };

test.describe("helpful counts once per member (local)", () => {
  test.use({ storageState: storageStatePath("junior") });

  test("repeated clicks on the post and a reply add 1 each, and the buttons switch to Marked helpful", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "one vote per member per item; run once");
    const me = await profileId(USERS.junior.handle);
    // A seeded thread with replies that this member hasn't voted on.
    const threads = await rest<(Thread & { replies: Reply[] })[]>(
      "posts?select=id,slug,helpful_count,replies(id,helpful_count)&seed_batch_id=not.is.null&reply_count=gt.0&order=created_at.desc&limit=20",
    );
    const mine = await rest<{ post_id: string | null; reply_id: string | null }[]>(`helpful_votes?select=post_id,reply_id&user_id=eq.${me}`);
    const t = threads.find((x) => !mine.some((v) => v.post_id === x.id || x.replies.some((r) => r.id === v.reply_id)))!;
    const reply = t.replies[0];

    try {
      await visit(page, `/q/${t.slug}`);
      const postBtn = page.getByRole("button", { name: new RegExp(`^Helpful \\(${t.helpful_count}\\)$`) });
      await postBtn.dblclick(); // two quick clicks
      await expect(page.getByTestId("post-helpful-marked")).toHaveText(`Marked helpful (${t.helpful_count + 1})`);
      await expect(page.getByRole("button", { name: /^Helpful \(/ })).toHaveCount(0);

      const replyRow = page.getByTestId("reply").filter({ has: page.locator(`input[name="reply_id"][value="${reply.id}"]`) });
      await replyRow.getByRole("button", { name: "Mark helpful" }).dblclick();
      await page.reload();

      // Server state after reload: +1 each, one vote row each.
      const [p] = await rest<Thread[]>(`posts?select=id,slug,helpful_count&id=eq.${t.id}`);
      const [r] = await rest<Reply[]>(`replies?select=id,helpful_count&id=eq.${reply.id}`);
      expect(p.helpful_count).toBe(t.helpful_count + 1);
      expect(r.helpful_count).toBe(reply.helpful_count + 1);
      const votes = await rest<unknown[]>(`helpful_votes?select=user_id&user_id=eq.${me}&or=(post_id.eq.${t.id},reply_id.eq.${reply.id})`);
      expect(votes).toHaveLength(2);
      await expect(page.getByTestId("post-helpful-marked")).toBeVisible();
      await expect(page.getByTestId("reply-helpful-marked").first()).toBeVisible();
    } finally {
      await restDelete(`helpful_votes?user_id=eq.${me}&or=(post_id.eq.${t.id},reply_id.eq.${reply.id})`);
      await restPatch(`posts?id=eq.${t.id}`, { helpful_count: t.helpful_count });
      await restPatch(`replies?id=eq.${reply.id}`, { helpful_count: reply.helpful_count });
    }
  });
});
