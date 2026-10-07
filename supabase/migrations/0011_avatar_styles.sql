-- ================================================================
-- Home Fixr — migration 0011: avatar styles (no photos)
-- ================================================================
-- Run AFTER 0010. Idempotent, one transaction.
--
-- Seeding plan §5a: no scraped or AI photos, no faces. A member's avatar is
-- one of:
--   'initials'  the existing avatar_initials on a muted colour pair the app
--               derives from the handle (default, so nothing changes for
--               existing members);
--   'icon'      a trade-flavoured icon from a small fixed set;
--   'none'      a neutral silhouette.
-- Members edit these on their own row through the existing RLS update policy;
-- the 0009 profiles guard still blocks is_founding_member / seed_batch_id.
-- ================================================================

begin;

alter table profiles add column if not exists avatar_style text not null default 'initials';
alter table profiles add column if not exists avatar_icon text;

alter table profiles drop constraint if exists profiles_avatar_style_valid;
alter table profiles add constraint profiles_avatar_style_valid
  check (avatar_style in ('initials', 'icon', 'none'));

alter table profiles drop constraint if exists profiles_avatar_icon_valid;
alter table profiles add constraint profiles_avatar_icon_valid
  check (avatar_icon is null or avatar_icon in
    ('wrench', 'flame', 'plug', 'snowflake', 'hardhat', 'zap', 'thermometer', 'hammer'));

-- An icon avatar must say which icon.
alter table profiles drop constraint if exists profiles_avatar_icon_required;
alter table profiles add constraint profiles_avatar_icon_required
  check (avatar_style <> 'icon' or avatar_icon is not null);

commit;
