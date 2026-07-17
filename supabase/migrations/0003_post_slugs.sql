-- ================================================================
-- Home Fixr — migration 0003: shareable post slugs
-- ================================================================
-- Run AFTER 0002. Adds posts.slug, auto-generates it on insert, and backfills
-- existing rows. Idempotent. Threads become /q/[slug] instead of /q/[uuid].
-- ================================================================

alter table posts add column if not exists slug text;

-- Lowercase, hyphenate, strip punctuation; trim leading/trailing hyphens.
create or replace function public.slugify(txt text)
returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(coalesce(txt, '')), '[^a-z0-9]+', '-', 'g'));
$$;

-- Slug = slugified title (capped) + short id suffix for guaranteed uniqueness.
create or replace function public.set_post_slug()
returns trigger language plpgsql as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := left(public.slugify(new.title), 60) || '-' || substr(new.id::text, 1, 8);
  end if;
  return new;
end $$;

drop trigger if exists on_post_set_slug on posts;
create trigger on_post_set_slug before insert on posts
  for each row execute function public.set_post_slug();

-- Backfill existing posts.
update posts
set slug = left(public.slugify(title), 60) || '-' || substr(id::text, 1, 8)
where slug is null or slug = '';

create unique index if not exists posts_slug_idx on posts(slug);
