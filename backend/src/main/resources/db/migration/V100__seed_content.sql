-- Realistic seed content authored by the seed users from V99.
-- Idempotent: each block guards against re-insertion by checking a marker column.

-- ============= COMPANIES =============
INSERT INTO companies (id, name, website, industry, created_at, updated_at)
SELECT gen_random_uuid(), 'Meta', 'https://meta.com', 'Tech', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM companies WHERE name = 'Meta');

INSERT INTO companies (id, name, website, industry, created_at, updated_at)
SELECT gen_random_uuid(), 'Datadog', 'https://datadoghq.com', 'Observability', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM companies WHERE name = 'Datadog');

INSERT INTO companies (id, name, website, industry, created_at, updated_at)
SELECT gen_random_uuid(), 'Vincit AI', 'https://vincit.ai', 'AI', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM companies WHERE name = 'Vincit AI');

INSERT INTO companies (id, name, website, industry, created_at, updated_at)
SELECT gen_random_uuid(), 'Stripe', 'https://stripe.com', 'Payments', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM companies WHERE name = 'Stripe');

-- ============= JOB OFFERS (recruiter@vincit.ai posts an AI role) =============
INSERT INTO job_offers (id, company_id, posted_by, title, description, type,
                        location, is_remote, moderation_status, created_at, updated_at)
SELECT gen_random_uuid(),
       (SELECT id FROM companies WHERE name = 'Vincit AI'),
       (SELECT id FROM users WHERE email = 'recruiter@vincit.ai'),
       'Senior ML Engineer — RecSys',
       'Join the core RecSys team owning feed ranking for 3B+ users. You will work on candidate generation, LTV modeling, and real-time inference at petabyte scale. Strong preference for ESPRIT alumni with RecSys or NLP experience.',
       'FULL_TIME', 'Tunis, TN', false, 'APPROVED', now(), now()
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'recruiter@vincit.ai')
  AND NOT EXISTS (SELECT 1 FROM job_offers WHERE title = 'Senior ML Engineer — RecSys');

INSERT INTO job_offers (id, company_id, posted_by, title, description, type,
                        location, is_remote, moderation_status, created_at, updated_at)
SELECT gen_random_uuid(),
       (SELECT id FROM companies WHERE name = 'Vincit AI'),
       (SELECT id FROM users WHERE email = 'recruiter@vincit.ai'),
       'AI Research Intern',
       '6-month internship on multimodal foundation models. You will pair with a Staff Research Scientist on a publication-track project. Open to ESPRIT IA students entering their final year.',
       'INTERNSHIP', 'Tunis, TN', true, 'APPROVED', now(), now()
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'recruiter@vincit.ai')
  AND NOT EXISTS (SELECT 1 FROM job_offers WHERE title = 'AI Research Intern');

-- A pending job so admins have something to moderate out of the box
INSERT INTO job_offers (id, company_id, posted_by, title, description, type,
                        location, is_remote, moderation_status, created_at, updated_at)
SELECT gen_random_uuid(),
       (SELECT id FROM companies WHERE name = 'Stripe'),
       (SELECT id FROM users WHERE email = 'recruiter@vincit.ai'),
       'Platform Engineer — Payments',
       'Building Stripe''s payment orchestration layer. Looking for distributed-systems engineers comfortable with Go and event-sourced architectures.',
       'FULL_TIME', 'Dublin, IE', false, 'PENDING', now(), now()
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'recruiter@vincit.ai')
  AND NOT EXISTS (SELECT 1 FROM job_offers WHERE title = 'Platform Engineer — Payments');

-- ============= EVENTS =============
INSERT INTO events (id, organizer_id, title, description, start_at, end_at,
                    location, capacity, is_virtual, moderation_status,
                    created_at, updated_at)
SELECT gen_random_uuid(),
       (SELECT id FROM users WHERE email = 'admin@esprit.tn'),
       'ESPRIT Career Day — Paris 2026',
       'The annual ESPRIT alumni career day in Paris. 42 ESPRIT-led companies hiring on-site. Speed networking by specialty, panel on EU tech, cocktail until 21:00.',
       now() + interval '30 days', now() + interval '30 days' + interval '4 hours',
       'Station F, Paris', 200, false, 'APPROVED', now(), now()
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'admin@esprit.tn')
  AND NOT EXISTS (SELECT 1 FROM events WHERE title = 'ESPRIT Career Day — Paris 2026');

INSERT INTO events (id, organizer_id, title, description, start_at,
                    location, is_virtual, moderation_status, created_at, updated_at)
SELECT gen_random_uuid(),
       (SELECT id FROM users WHERE email = 'omar.kthiri@esprit.tn'),
       'AI & ML Meetup — Tunis',
       'Monthly meetup for the Tunis AI community. This month: hosting a virtual Q&A on RecSys at Meta scale.',
       now() + interval '14 days',
       'Online (Zoom)', true, 'APPROVED', now(), now()
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'omar.kthiri@esprit.tn')
  AND NOT EXISTS (SELECT 1 FROM events WHERE title = 'AI & ML Meetup — Tunis');

INSERT INTO events (id, organizer_id, title, description, start_at,
                    location, is_virtual, moderation_status, created_at, updated_at)
SELECT gen_random_uuid(),
       (SELECT id FROM users WHERE email = 'amal.dridi@esprit.tn'),
       'Promo 2014 — 12-year reunion',
       'Promo 2014 reunion in La Marsa. Whoever can make it. All-day, no agenda.',
       now() + interval '21 days',
       'La Marsa, TN', false, 'PENDING', now(), now()
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'amal.dridi@esprit.tn')
  AND NOT EXISTS (SELECT 1 FROM events WHERE title = 'Promo 2014 — 12-year reunion');

-- ============= GROUPS =============
INSERT INTO groups (id, name, type, description, is_private, owner_id,
                    moderation_status, created_at, updated_at)
SELECT gen_random_uuid(), 'AI & ML Alumni', 'INTEREST',
       'ESPRIT alumni working on ML, LLMs, computer vision, and research.',
       false,
       (SELECT id FROM users WHERE email = 'omar.kthiri@esprit.tn'),
       'APPROVED', now(), now()
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'omar.kthiri@esprit.tn')
  AND NOT EXISTS (SELECT 1 FROM groups WHERE name = 'AI & ML Alumni');

INSERT INTO groups (id, name, type, description, is_private, owner_id,
                    moderation_status, created_at, updated_at)
SELECT gen_random_uuid(), 'ESPRIT Paris', 'REGION',
       'ESPRIT alumni based in Paris and Île-de-France.',
       false,
       (SELECT id FROM users WHERE email = 'amal.dridi@esprit.tn'),
       'APPROVED', now(), now()
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'amal.dridi@esprit.tn')
  AND NOT EXISTS (SELECT 1 FROM groups WHERE name = 'ESPRIT Paris');

INSERT INTO groups (id, name, type, description, is_private, owner_id,
                    moderation_status, created_at, updated_at)
SELECT gen_random_uuid(), 'Founders Circle', 'INTEREST',
       'ESPRIT alumni founders sharing fundraising, hiring, and product playbooks.',
       true,
       (SELECT id FROM users WHERE email = 'omar.kthiri@esprit.tn'),
       'PENDING', now(), now()
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'omar.kthiri@esprit.tn')
  AND NOT EXISTS (SELECT 1 FROM groups WHERE name = 'Founders Circle');

-- Owner-membership rows for the approved groups
INSERT INTO group_members (id, group_id, user_id, role, joined_at, created_at, updated_at)
SELECT gen_random_uuid(),
       g.id,
       g.owner_id,
       'OWNER',
       now(), now(), now()
FROM groups g
WHERE g.name IN ('AI & ML Alumni', 'ESPRIT Paris', 'Founders Circle')
  AND NOT EXISTS (
        SELECT 1 FROM group_members gm
        WHERE gm.group_id = g.id AND gm.user_id = g.owner_id
      );

-- ============= MENTOR PROFILES =============
INSERT INTO mentor_profiles (id, user_id, bio, expertise_areas, availability_hours,
                              accepts_flash, moderation_status, created_at, updated_at)
SELECT gen_random_uuid(),
       (SELECT id FROM users WHERE email = 'omar.kthiri@esprit.tn'),
       'ML Engineer at Meta London, ESPRIT IA ''18. Mentored 4 GL alumni transitioning to ML roles. Happy to talk system design, ML interview prep, and EU tech career moves.',
       '["RecSys","PyTorch","NLP","System Design"]'::jsonb,
       2, true, 'APPROVED', now(), now()
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'omar.kthiri@esprit.tn')
  AND NOT EXISTS (
        SELECT 1 FROM mentor_profiles mp
        JOIN users u ON u.id = mp.user_id
        WHERE u.email = 'omar.kthiri@esprit.tn'
      );

INSERT INTO mentor_profiles (id, user_id, bio, expertise_areas, availability_hours,
                              accepts_flash, moderation_status, created_at, updated_at)
SELECT gen_random_uuid(),
       (SELECT id FROM users WHERE email = 'amal.dridi@esprit.tn'),
       'SWE at Datadog Paris, ESPRIT GL ''14. I focus on observability and distributed systems. Open to one-off flash sessions on resume reviews and architecture interviews.',
       '["Distributed Systems","Go","Observability","Career Coaching"]'::jsonb,
       3, true, 'PENDING', now(), now()
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'amal.dridi@esprit.tn')
  AND NOT EXISTS (
        SELECT 1 FROM mentor_profiles mp
        JOIN users u ON u.id = mp.user_id
        WHERE u.email = 'amal.dridi@esprit.tn'
      );

-- ============= POSTS (give the feed something to show) =============
INSERT INTO posts (id, author_id, content, visibility, created_at, updated_at)
SELECT gen_random_uuid(),
       (SELECT id FROM users WHERE email = 'omar.kthiri@esprit.tn'),
       'We''re hiring 3 ML engineers for the recommendations team at Meta London. Strong preference for ESPRIT alumni with RecSys or NLP experience. DM me — I''ll fast-track you past the initial screen.',
       'NETWORK', now(), now()
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'omar.kthiri@esprit.tn')
  AND NOT EXISTS (
        SELECT 1 FROM posts WHERE content LIKE 'We''re hiring 3 ML engineers%'
      );

INSERT INTO posts (id, author_id, content, visibility, created_at, updated_at)
SELECT gen_random_uuid(),
       (SELECT id FROM users WHERE email = 'amal.dridi@esprit.tn'),
       'Seven years ago I was sitting in lab 3B debugging a kernel module at 3am with three other promo 2014 folks. Today one of them just raised $12M for his robotics startup in Berlin. ESPRIT built that circle. Never leaving it.',
       'NETWORK', now(), now()
WHERE EXISTS (SELECT 1 FROM users WHERE email = 'amal.dridi@esprit.tn')
  AND NOT EXISTS (
        SELECT 1 FROM posts WHERE content LIKE 'Seven years ago I was sitting in lab 3B%'
      );
