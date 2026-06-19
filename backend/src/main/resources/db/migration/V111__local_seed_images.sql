-- Point the seeded demo images at locally-bundled copies (served by nginx at
-- /assets/seed/...) so the feed / events / groups / avatars load instantly and
-- never change, instead of fetching from picsum / loremflickr / randomuser on
-- every page load.
--
-- IMPORTANT: run scripts/fetch-seed-images.sh once (downloads the files into
-- frontend/src/assets/seed) and rebuild the frontend, or these paths 404.
-- Only the seed/demo remote URLs are rewritten — real user uploads (MinIO) are
-- left untouched.

-- Avatars: randomuser host -> local portraits (same men/{n}.jpg, women/{n}.jpg layout)
UPDATE profiles
SET avatar_url = replace(avatar_url, 'https://randomuser.me/api/portraits', '/assets/seed/portraits'),
    updated_at = now()
WHERE avatar_url LIKE 'https://randomuser.me/%';

-- Any leftover pravatar avatars (seed users not in the gendered map) -> a local face
UPDATE profiles
SET avatar_url = '/assets/seed/portraits/men/' || (1 + (abs(hashtext(id::text)) % 24)) || '.jpg',
    updated_at = now()
WHERE avatar_url LIKE 'https://i.pravatar.cc/%';

-- Feed post images -> local pool of 12
UPDATE attachments
SET file_url = '/assets/seed/posts/' || (1 + (abs(hashtext(id::text)) % 12)) || '.jpg',
    updated_at = now()
WHERE file_url LIKE '%picsum.photos%';

-- Event banners -> local pool of 12
UPDATE events
SET banner_url = '/assets/seed/events/' || (1 + (abs(hashtext(id::text)) % 12)) || '.jpg',
    updated_at = now()
WHERE banner_url LIKE '%picsum.photos%';

-- Group covers -> local, mapped by name (order matches the downloaded files)
UPDATE groups g
SET cover_url = m.url, updated_at = now()
FROM (VALUES
  ('AI & ML Alumni',       '/assets/seed/groups/1.jpg'),
  ('IA & Data Science',    '/assets/seed/groups/2.jpg'),
  ('ESPRIT Paris',         '/assets/seed/groups/3.jpg'),
  ('ESPRIT Dubai & Gulf',  '/assets/seed/groups/4.jpg'),
  ('Women in Tech ESPRIT', '/assets/seed/groups/5.jpg'),
  ('Founders Circle',      '/assets/seed/groups/6.jpg'),
  ('Founders & Builders',  '/assets/seed/groups/7.jpg'),
  ('Cybersecurity Guild',  '/assets/seed/groups/8.jpg'),
  ('Promo 2018',           '/assets/seed/groups/9.jpg'),
  ('Cloud & DevOps',       '/assets/seed/groups/10.jpg'),
  ('Embedded & Robotics',  '/assets/seed/groups/11.jpg'),
  ('GL · All Promos',      '/assets/seed/groups/12.jpg')
) AS m(name, url)
WHERE g.name = m.name;
