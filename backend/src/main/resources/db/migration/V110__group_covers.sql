-- Give the seeded groups topic-related cover images (replacing the generic
-- picsum covers from V100/V106). Uses loremflickr keyword images so each cover
-- matches the group's theme. New groups created in-app upload their own banner.

UPDATE groups g
SET cover_url = m.url, updated_at = now()
FROM (VALUES
  ('AI & ML Alumni',       'https://loremflickr.com/1000/300/artificial,intelligence'),
  ('IA & Data Science',    'https://loremflickr.com/1000/300/data,science'),
  ('ESPRIT Paris',         'https://loremflickr.com/1000/300/paris,city'),
  ('ESPRIT Dubai & Gulf',  'https://loremflickr.com/1000/300/dubai,city'),
  ('Women in Tech ESPRIT', 'https://loremflickr.com/1000/300/women,technology'),
  ('Founders Circle',      'https://loremflickr.com/1000/300/startup,office'),
  ('Founders & Builders',  'https://loremflickr.com/1000/300/startup,team'),
  ('Cybersecurity Guild',  'https://loremflickr.com/1000/300/cybersecurity,security'),
  ('Promo 2018',           'https://loremflickr.com/1000/300/graduation,university'),
  ('Cloud & DevOps',       'https://loremflickr.com/1000/300/cloud,datacenter'),
  ('Embedded & Robotics',  'https://loremflickr.com/1000/300/robotics,robot'),
  ('GL · All Promos',      'https://loremflickr.com/1000/300/software,programming')
) AS m(name, url)
WHERE g.name = m.name;
