-- ============================================================================
-- Demo seed for investor / client demos. Rich, realistic content built on top
-- of V99 (specialties, promotions, base users) and V100 (initial content).
--
-- All seeded accounts share the password "Test@1234"
--   (BCrypt(12) hash below, identical to V99).
-- Images use public picsum.photos URLs (rendered raw by the app).
-- Versioned migration: runs once on a fresh DB. Wipe + reseed with:
--   docker compose down -v && docker compose up --build
-- ============================================================================

-- ============= USERS + PROFILES =============================================
WITH demo(email, fname, lname, role, headline, country, city, spec, yr, otw) AS (
  VALUES
    ('sami.bouaziz@espritconnect.tn','Sami','BOUAZIZ','STUDENT','Final-year GL student · looking for a PFE',     'Tunisia','Ariana','GL',2025,true),
    ('nour.benali@espritconnect.tn','Nour','BEN ALI','STUDENT','IA student · NLP enthusiast',                    'Tunisia','Tunis','IA',2025,true),
    ('yassine.trabelsi@espritconnect.tn','Yassine','TRABELSI','STUDENT','RT student · networks & cloud',         'Tunisia','Sousse','RT',2024,true),
    ('wejden.ghabarou@espritconnect.tn','Wejden','GHABAROU','STUDENT','Civil engineering student',                       'Tunisia','bizerte','CIVIL',2025,true),
    ('Abdallah.neifarrr@espritconnect.tn','Aziz','MANSOUR','STUDENT','Mechatronics · robotics club lead',             'Tunisia','Tunis','INFOTRONIC',2024,true),
    ('rania.khelifi@espritconnect.tn','Rania','KHELIFI','ALUMNI','Frontend Engineer · Spotify',                  'Sweden','Stockholm','GL',2018,false),
    ('moataz.marouani@espritconnect.tn','Moataz','MAROUANI','ALUMNI','Backend Engineer · Datadog',                     'France','Paris','GL',2017,true),
    ('ines.chaabane@espritconnect.tn','Ines','CHAABANE','ALUMNI','Data Scientist · Doctolib',                    'France','Paris','IA',2019,false),
    ('abdallah.neifar@espritconnect.tn','Abdallah','NEIFAR','ALUMNI','DevOps Engineer · OVHcloud',                   'France','Lyon','RT',2016,true),
    ('syrine.hamdi@espritconnect.tn','Syrine','HAMDI','ALUMNI','Product Manager · Vercel',                       'Germany','Berlin','GL',2017,false),
    ('wassim.gabsi@espritconnect.tn','Wassim','GABSI','ALUMNI','Cloud Architect · AWS',                          'Ireland','Dublin','RT',2015,false),
    ('olfa.bennour@espritconnect.tn','Olfa','BEN NOUR','ALUMNI','ML Engineer · InstaDeep',                       'Tunisia','Tunis','IA',2018,true),
    ('hatem.zouari@espritconnect.tn','Hatem','ZOUARI','ALUMNI','Civil Engineer · Bouygues',                      'France','Paris','CIVIL',2014,false),
    ('dorra.melliti@espritconnect.tn','Dorra','MELLITI','ALUMNI','Embedded Engineer · Sagemcom',                 'Tunisia','Ariana','INFOTRONIC',2016,true),
    ('firas.ayadi@espritconnect.tn','Firas','AYADI','ALUMNI','Full-stack Engineer · Expensya',                   'Tunisia','Tunis','GL',2019,true),
    ('maha.brahem@espritconnect.tn','Maha','BRAHEM','ALUMNI','BI Consultant · Capgemini',                        'France','Toulouse','ERP',2018,false),
    ('anis.sassi@espritconnect.tn','Anis','SASSI','ALUMNI','SRE · Google',                                       'Switzerland','Zurich','RT',2015,false),
    ('sofien.lahmar@espritconnect.tn','Sofien','LAHMAR','ALUMNI','Mechanical Engineer · Tesla',                  'Germany','Berlin','MECA',2016,true),
    ('hela.guesmi@espritconnect.tn','Hela','GUESMI','ALUMNI','iOS Engineer · Dabchy',                            'Tunisia','Tunis','GL',2020,true),
    ('bilel.rekik@espritconnect.tn','Bilel','REKIK','ALUMNI','Security Engineer · Orange',                       'France','Paris','RT',2017,false),
    ('nadia.cherif@espritconnect.tn','Nadia','CHERIF','ALUMNI','Data Engineer · Ubiai',                          'Tunisia','Sousse','IA',2019,true),
    ('ramzi.bensalah@espritconnect.tn','Ramzi','BEN SALAH','ALUMNI','Founder · early-stage SaaS',               'Tunisia','Tunis','GL',2014,false),
    ('amine.toumi@espritconnect.tn','Amine','TOUMI','MENTOR','Staff Engineer · Stripe · mentor',                'Ireland','Dublin','GL',2013,false),
    ('leila.haddad@espritconnect.tn','Leila','HADDAD','MENTOR','Engineering Manager · Meta · mentor',           'United Kingdom','London','IA',2014,false),
    ('karim.fakhfakh@espritconnect.tn','Karim','FAKHFAKH','MENTOR','Principal Architect · Microsoft · mentor',  'France','Paris','RT',2012,false),
    ('sonia.maaloul@espritconnect.tn','Sonia','MAALOUL','MENTOR','Head of Data · Sofrecom · mentor',            'Tunisia','Tunis','IA',2013,false),
    ('walid.benamor@espritconnect.tn','Walid','BEN AMOR','MENTOR','CTO · robotics startup · mentor',            'Tunisia','Ariana','INFOTRONIC',2011,false),
    ('fatma.kallel@espritconnect.tn','Fatma','KALLEL','MENTOR','Lead PM · Datadog · mentor',                    'France','Paris','GL',2014,false),
    ('tarek.benyoussef@espritconnect.tn','Tarek','BEN YOUSSEF','MENTOR','Civil project director · mentor',      'UAE','Dubai','CIVIL',2010,false),
    ('asma.nasri@espritconnect.tn','Asma','NASRI','MENTOR','Senior ML Scientist · DeepMind · mentor',          'United Kingdom','London','IA',2015,false),
    ('marie.dubois@espritconnect.tn','Marie','DUBOIS','ALUMNI','Software Engineer · Qonto',                      'France','Paris','GL',2018,false),
    ('lucas.martin@espritconnect.tn','Lucas','MARTIN','ALUMNI','Platform Engineer · BlaBlaCar',                  'France','Paris','RT',2017,true),
    ('sarah.cohen@espritconnect.tn','Sarah','COHEN','ALUMNI','Data Analyst · Shopify',                           'Canada','Montreal','ERP',2019,true),
    ('david.lemoine@vincit.ai','David','LEMOINE','RECRUITER','Tech Recruiter · Vincit AI',                       'France','Paris','IA',2016,false),
    ('julia.weber@hire.de','Julia','WEBER','RECRUITER','Talent Partner · Berlin scale-ups',                     'Germany','Berlin','GL',2015,false),
    ('omar.recruit@gulftalent.ae','Omar','HADDAD','RECRUITER','Recruiter · Gulf tech',                           'UAE','Dubai','RT',2014,false),
    ('youssef.gargouri@espritconnect.tn','Youssef','GARGOURI','ALUMNI','Game Developer · Ubisoft',               'Canada','Montreal','GL',2018,true),
    ('mariem.bouchhima@espritconnect.tn','Mariem','BOUCHHIMA','ALUMNI','QA Lead · Telnet',                       'Tunisia','Tunis','GL',2017,false),
    ('zied.kacem@espritconnect.tn','Zied','KACEM','ALUMNI','Network Engineer · Tunisie Telecom',                'Tunisia','Tunis','RT',2016,true),
    ('selma.riahi@espritconnect.tn','Selma','RIAHI','ALUMNI','UX Designer · Swile',                              'France','Lyon','GL',2019,false)
)
, ins_users AS (
  INSERT INTO users (id, email, password_hash, role, status, open_to_work, created_at, updated_at)
  SELECT gen_random_uuid(), d.email,
         '$2a$12$VxKzQH8aVFIK60jgRdJ9m.O7KzS8zjlxg.LxA8fD4vfmI3lP1l8oS',
         d.role, 'ACTIVE', d.otw,
         now() - (random() * interval '900 days'), now()
  FROM demo d
  ON CONFLICT (email) DO NOTHING
  RETURNING id, email
)
INSERT INTO profiles (id, user_id, first_name, last_name, headline, bio, country, city,
                      is_searchable, promotion_id, specialty_id, created_at, updated_at)
SELECT gen_random_uuid(), u.id, d.fname, d.lname, d.headline,
       'ESPRIT ' || d.spec || ' graduate. ' || d.headline || '.',
       d.country, d.city, true,
       (SELECT id FROM promotions WHERE year = d.yr LIMIT 1),
       (SELECT id FROM specialties WHERE code = d.spec),
       now(), now()
FROM demo d
JOIN ins_users u ON u.email = d.email   -- newly-inserted users (CTE), not the base table
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = u.id);

-- ============= SKILLS (by specialty, for directory richness) ================
WITH skillmap(spec, skill) AS (
  VALUES
    ('GL','Java'),('GL','Spring Boot'),('GL','Angular'),('GL','React'),('GL','PostgreSQL'),('GL','Docker'),
    ('IA','Python'),('IA','PyTorch'),('IA','TensorFlow'),('IA','NLP'),('IA','Computer Vision'),('IA','MLOps'),
    ('RT','Kubernetes'),('RT','AWS'),('RT','Networking'),('RT','Terraform'),('RT','Linux'),('RT','Security'),
    ('INFOTRONIC','C++'),('INFOTRONIC','Embedded C'),('INFOTRONIC','IoT'),('INFOTRONIC','FPGA'),
    ('CIVIL','AutoCAD'),('CIVIL','Revit'),('CIVIL','Structural Analysis'),('CIVIL','BIM'),
    ('MECA','SolidWorks'),('MECA','CATIA'),('MECA','Thermodynamics'),
    ('ERP','SAP'),('ERP','Power BI'),('ERP','SQL'),('ERP','Tableau')
)
INSERT INTO skills (id, profile_id, name, level, created_at, updated_at)
SELECT gen_random_uuid(), p.id, sm.skill, 2 + floor(random() * 4)::int, now(), now()
FROM profiles p
JOIN specialties s ON s.id = p.specialty_id
JOIN skillmap sm ON sm.spec = s.code
WHERE NOT EXISTS (SELECT 1 FROM skills k WHERE k.profile_id = p.id AND k.name = sm.skill);

-- ============= COMPANIES ====================================================
INSERT INTO companies (id, name, website, industry, created_at, updated_at)
SELECT gen_random_uuid(), c.name, c.web, c.ind, now(), now()
FROM (VALUES
  ('Google','https://google.com','Tech'),
  ('Microsoft','https://microsoft.com','Tech'),
  ('Amazon','https://amazon.com','Cloud'),
  ('Spotify','https://spotify.com','Music'),
  ('Qonto','https://qonto.com','Fintech'),
  ('InstaDeep','https://instadeep.com','AI'),
  ('Orange','https://orange.com','Telecom'),
  ('Capgemini','https://capgemini.com','Consulting'),
  ('Expensya','https://expensya.com','SaaS'),
  ('Telnet','https://telnet.tn','Engineering'),
  ('Sofrecom','https://sofrecom.com','Telecom'),
  ('Ubisoft','https://ubisoft.com','Gaming')
) AS c(name, web, ind)
WHERE NOT EXISTS (SELECT 1 FROM companies x WHERE x.name = c.name);

-- ============= JOB OFFERS (varied types/locations/status) ===================
INSERT INTO job_offers (id, company_id, posted_by, title, description, type,
                        location, is_remote, moderation_status, created_at, updated_at)
SELECT gen_random_uuid(),
       (SELECT id FROM companies WHERE name = j.company),
       (SELECT id FROM users WHERE role = 'RECRUITER' ORDER BY random() LIMIT 1),
       j.title, j.descr, j.jtype, j.loc, j.remote, j.status,
       now() - (random() * interval '40 days'), now()
FROM (VALUES
  ('Senior Backend Engineer (Java/Spring)','Own core services at scale. Java 21, Spring Boot, PostgreSQL, Kafka. ESPRIT GL alumni strongly encouraged.','FULL_TIME','Paris, FR',false,'Qonto','APPROVED'),
  ('Frontend Engineer (Angular)','Build the next-gen dashboard with Angular 18 + signals. Design-system minded.','FULL_TIME','Remote · EU',true,'Spotify','APPROVED'),
  ('Machine Learning Engineer','Train and ship recommendation models. PyTorch, MLOps, large-scale inference.','FULL_TIME','Tunis, TN',false,'InstaDeep','APPROVED'),
  ('Cloud / DevOps Engineer','Kubernetes, Terraform, AWS. Own the platform and CI/CD.','FULL_TIME','Dublin, IE',false,'Amazon','APPROVED'),
  ('Data Scientist','NLP and forecasting on real product data. Python, SQL, experimentation.','FULL_TIME','Paris, FR',true,'Capgemini','APPROVED'),
  ('Embedded Software Engineer','C/C++ on ARM, RTOS, IoT devices. Mechatronics background a plus.','FULL_TIME','Ariana, TN',false,'Telnet','APPROVED'),
  ('AI Research Intern','6-month internship on multimodal models with a Staff Research Scientist.','INTERNSHIP','Tunis, TN',true,'InstaDeep','APPROVED'),
  ('Software Engineering Intern (PFE)','Final-year PFE: full-stack feature delivery with a senior mentor.','INTERNSHIP','Tunis, TN',false,'Expensya','APPROVED'),
  ('Security Engineer','AppSec, threat modeling, pentest coordination. CISSP a plus.','FULL_TIME','Paris, FR',false,'Orange','APPROVED'),
  ('Game Developer (Unreal)','Gameplay systems in C++/Unreal for a AAA title.','FULL_TIME','Montreal, CA',false,'Ubisoft','APPROVED'),
  ('Site Reliability Engineer','Keep 99.99% up. Go, observability, on-call rotation.','FULL_TIME','Zurich, CH',true,'Google','APPROVED'),
  ('BI / Data Analyst','Power BI + SQL. Turn raw data into exec dashboards.','PART_TIME','Tunis, TN',true,'Sofrecom','APPROVED'),
  ('Mobile Engineer (iOS)','Swift, SwiftUI, clean architecture for a fintech app.','FULL_TIME','Remote · EU',true,'Qonto','APPROVED'),
  ('Platform Engineer','Internal developer platform, Go + Kubernetes.','FULL_TIME','Berlin, DE',false,'Microsoft','APPROVED'),
  ('Freelance React Developer','3-month mission to ship a marketing site + dashboard.','FREELANCE','Remote',true,'Expensya','APPROVED'),
  ('QA Automation Engineer','Cypress/Playwright, CI gating, flaky-test hunting.','FULL_TIME','Tunis, TN',false,'Telnet','APPROVED'),
  ('Solutions Architect (SAP)','Lead ERP rollouts for enterprise clients.','FULL_TIME','Paris, FR',false,'Capgemini','APPROVED'),
  ('Network Engineer','Design and operate carrier-grade networks.','FULL_TIME','Tunis, TN',false,'Orange','APPROVED'),
  ('Staff Engineer — Payments','Event-sourced payment orchestration. Go, distributed systems.','FULL_TIME','Dublin, IE',false,'Amazon','PENDING'),
  ('Junior Data Engineer','Entry-level: build ETL pipelines, learn from senior data folks.','FULL_TIME','Sousse, TN',false,'Sofrecom','PENDING'),
  ('AI Product Manager','Own the roadmap for an LLM-powered feature.','FULL_TIME','Remote · EU',true,'Microsoft','APPROVED'),
  ('Mechanical Design Engineer','CATIA/SolidWorks for EV components.','FULL_TIME','Berlin, DE',false,'Ubisoft','APPROVED')
) AS j(title, descr, jtype, loc, remote, company, status)
WHERE EXISTS (SELECT 1 FROM users WHERE role = 'RECRUITER')
  AND NOT EXISTS (SELECT 1 FROM job_offers o WHERE o.title = j.title);

-- ============= JOB APPLICATIONS (a different count per job) ==================
INSERT INTO job_applications (id, job_offer_id, applicant_id, cv_url, cover_letter, status, created_at, updated_at)
SELECT gen_random_uuid(), j.id, u.id, NULL,
       'Excited about this role — my ESPRIT background fits well.',
       (ARRAY['NEW','NEW','NEW','REVIEWING','REVIEWING','INTERVIEW','OFFER','HIRED','REJECTED'])[1 + floor(random() * 9)::int],
       now() - (random() * interval '25 days'), now()
FROM job_offers j
CROSS JOIN LATERAL (
  SELECT id FROM users
  WHERE role IN ('STUDENT','ALUMNI','MENTOR')
  ORDER BY random()
  LIMIT floor(random() * 26)::int        -- 0..25 applicants, varies per job
) u
WHERE NOT EXISTS (
  SELECT 1 FROM job_applications a WHERE a.job_offer_id = j.id AND a.applicant_id = u.id
);

-- ============= EVENTS (with banner images) ==================================
INSERT INTO events (id, organizer_id, title, description, start_at, end_at,
                    location, banner_url, capacity, is_virtual, moderation_status, created_at, updated_at)
SELECT gen_random_uuid(),
       (SELECT id FROM users WHERE role IN ('ALUMNI','MENTOR','ADMIN') ORDER BY random() LIMIT 1),
       e.title, e.descr,
       now() + (e.days || ' days')::interval,
       now() + (e.days || ' days')::interval + interval '3 hours',
       e.loc,
       'https://picsum.photos/seed/ev-' || left(md5(e.title), 10) || '/1200/420',
       e.cap, e.virtual, 'APPROVED',
       now() - (random() * interval '20 days'), now()
FROM (VALUES
  ('ESPRIT Tech Talk — System Design at Scale','A deep dive into designing systems for millions of users, with Q&A.', 7,'ESPRIT Campus, Ghazela',180,false),
  ('AI & ML Meetup — LLMs in Production','Monthly AI community meetup. This month: shipping LLM features safely.', 14,'Online (Teams)',300,true),
  ('Women in Tech ESPRIT — Mixer','Networking evening celebrating women engineers across promos.', 10,'Tunis',120,false),
  ('Founders Breakfast','Casual breakfast for alumni founders to swap fundraising notes.', 18,'Berlin',40,false),
  ('Cloud Day — Kubernetes Hands-on','A hands-on workshop on K8s, Helm, and GitOps.', 21,'Sfax',90,false),
  ('Promo 2018 Reunion','Whoever can make it — all day, no agenda.', 30,'La Marsa, TN',200,false),
  ('Career Day — Paris','42 ESPRIT-led companies hiring on-site. Speed networking by specialty.', 35,'Station F, Paris',250,false),
  ('Cybersecurity CTF Night','Capture-the-flag for students and alumni. Prizes for the top 3.', 12,'ESPRIT Campus',150,false),
  ('Embedded & Robotics Showcase','Demos from the robotics club + industry guests.', 25,'Ariana',100,false),
  ('Data Engineering Workshop','Building reliable ETL pipelines, from ingestion to dashboards.', 16,'Online (Teams)',200,true),
  ('Mobile Dev Meetup','Flutter vs native — a friendly debate and live coding.', 9,'Tunis',80,false),
  ('ESPRIT Alumni Gala 2026','The annual black-tie gala. Awards, dinner, and live music.', 60,'Gammarth, TN',400,false)
) AS e(title, descr, days, loc, cap, virtual)
WHERE NOT EXISTS (SELECT 1 FROM events x WHERE x.title = e.title);

-- ============= EVENT RSVPs (varied attendance) ==============================
INSERT INTO event_rsvps (id, event_id, user_id, status, responded_at, created_at, updated_at)
SELECT gen_random_uuid(), e.id, u.id,
       (ARRAY['GOING','GOING','GOING','MAYBE','NOT_GOING'])[1 + floor(random() * 5)::int],
       now() - (random() * interval '10 days'), now(), now()
FROM events e
CROSS JOIN LATERAL (
  SELECT id FROM users ORDER BY random() LIMIT (5 + floor(random() * 45)::int)
) u
WHERE NOT EXISTS (
  SELECT 1 FROM event_rsvps r WHERE r.event_id = e.id AND r.user_id = u.id
);

-- ============= GROUPS (with cover images) ===================================
INSERT INTO groups (id, name, type, description, is_private, cover_url, owner_id, moderation_status, created_at, updated_at)
SELECT gen_random_uuid(), g.name, g.gtype, g.descr, g.priv,
       'https://picsum.photos/seed/grp-' || left(md5(g.name), 10) || '/1000/300',
       (SELECT id FROM users WHERE role IN ('ALUMNI','MENTOR') ORDER BY random() LIMIT 1),
       'APPROVED',
       now() - (random() * interval '300 days'), now()
FROM (VALUES
  ('GL · All Promos','SPECIALTY','Software engineering alumni — jobs, referrals, and tech talk.',false),
  ('IA & Data Science','INTEREST','ML, LLMs, computer vision, and research across ESPRIT.',false),
  ('ESPRIT Paris','REGION','Alumni based in Paris and Île-de-France.',false),
  ('ESPRIT Dubai & Gulf','REGION','Alumni in the UAE and the Gulf region.',false),
  ('Women in Tech ESPRIT','INTEREST','Community, mentorship, and events for women engineers.',false),
  ('Founders & Builders','INTEREST','Alumni founders sharing fundraising and hiring playbooks.',true),
  ('Cybersecurity Guild','INTEREST','Blue team, red team, CTFs, and certs.',false),
  ('Promo 2018','PROMO','Class of 2018 — stay in touch.',false),
  ('Cloud & DevOps','INTEREST','Kubernetes, IaC, SRE, and platform engineering.',false),
  ('Embedded & Robotics','INTEREST','Hardware, firmware, IoT, and robotics.',false)
) AS g(name, gtype, descr, priv)
WHERE NOT EXISTS (SELECT 1 FROM groups x WHERE x.name = g.name);

-- owner membership for every group missing it
INSERT INTO group_members (id, group_id, user_id, role, joined_at, created_at, updated_at)
SELECT gen_random_uuid(), g.id, g.owner_id, 'OWNER', now(), now(), now()
FROM groups g
WHERE NOT EXISTS (
  SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = g.owner_id
);

-- random members (varied count per group)
INSERT INTO group_members (id, group_id, user_id, role, joined_at, created_at, updated_at)
SELECT gen_random_uuid(), g.id, u.id, 'MEMBER',
       now() - (random() * interval '200 days'), now(), now()
FROM groups g
CROSS JOIN LATERAL (
  SELECT id FROM users ORDER BY random() LIMIT (6 + floor(random() * 40)::int)
) u
WHERE u.id <> g.owner_id
  AND NOT EXISTS (
    SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = u.id
  );

-- ============= MENTOR PROFILES (every MENTOR-role user) =====================
INSERT INTO mentor_profiles (id, user_id, bio, expertise_areas, availability_hours,
                             accepts_flash, moderation_status, created_at, updated_at)
SELECT gen_random_uuid(), u.id,
       'ESPRIT alumnus happy to mentor juniors on careers, interview prep, and system design.',
       '["System Design","Career Coaching","Interview Prep","Tech Leadership"]'::jsonb,
       1 + floor(random() * 4)::int, true, 'APPROVED', now(), now()
FROM users u
WHERE u.role = 'MENTOR'
  AND NOT EXISTS (SELECT 1 FROM mentor_profiles mp WHERE mp.user_id = u.id);

-- ============= MENTORSHIP REQUESTS (varied status) ==========================
INSERT INTO mentorship_requests (id, mentee_id, mentor_profile_id, goals, type, status, match_score, created_at, updated_at)
SELECT gen_random_uuid(),
       (SELECT id FROM users WHERE role IN ('STUDENT','ALUMNI') ORDER BY random() LIMIT 1),
       mp.id,
       'Looking for guidance on landing my next role and growing into seniority.',
       (ARRAY['FLASH','STRUCTURED'])[1 + floor(random() * 2)::int],
       (ARRAY['PENDING','PENDING','ACCEPTED','ACCEPTED','COMPLETED','REJECTED'])[1 + floor(random() * 6)::int],
       round((40 + random() * 60)::numeric, 0),
       now() - (random() * interval '40 days'), now()
FROM mentor_profiles mp
CROSS JOIN generate_series(1, (1 + floor(random() * 4)::int)) g;

-- ============= FEED POSTS (with images) =====================================
INSERT INTO posts (id, author_id, content, visibility, created_at, updated_at)
SELECT gen_random_uuid(),
       (SELECT u.id FROM users u JOIN profiles p ON p.user_id = u.id ORDER BY random() LIMIT 1),
       c.txt, 'NETWORK',
       now() - (random() * interval '70 days'), now()
FROM (VALUES
  ('Just shipped a major refactor that cut our API p99 latency by 40%. Small wins compound. 🚀'),
  ('We are hiring 3 engineers on my team — DM me if you are ESPRIT and want a referral.'),
  ('Reminder: the best career move I made was saying yes to mentoring. Pay it forward, folks.'),
  ('Five years ago I was debugging in lab 3B at 3am. Today we crossed 1M users. ESPRIT built that grit.'),
  ('Hot take: code review culture matters more than your framework choice. Fight me in the comments. 😄'),
  ('Finally passed my AWS Solutions Architect exam! Happy to share notes with anyone preparing.'),
  ('Our PFE project got accepted at a national competition. Proud of the team. 🇹🇳'),
  ('Looking for a frontend mentor (Angular/React). Anyone open to a flash session this week?'),
  ('Open-sourced a small library for typed event buses in Java. Link in comments.'),
  ('Conference takeaway: ship small, measure, repeat. Big-bang releases are where dreams go to die.'),
  ('Grateful to have spoken at ESPRIT Career Day this year. The new generation is seriously talented.'),
  ('Switching from consulting to product. Scary but exciting. Any alumni who made the jump?'),
  ('PSA: back up your databases. Learned this the hard way today. 😅'),
  ('Just mentored my 10th ESPRIT junior into their first role. This community is special.'),
  ('We migrated to Kubernetes and our deploys went from 30 min to 3. Worth every late night.'),
  ('Reading about LLM agents this weekend. The tooling is moving insanely fast.'),
  ('Hiring a data engineer in Tunis — entry level welcome. Comment and I will reach out.'),
  ('Hit a 6-month streak of contributing to open source. Consistency over intensity.'),
  ('Our robotics club just demoed an autonomous line-follower. The students nailed it. 🤖'),
  ('Reminder that imposter syndrome never fully goes away — you just get better at ignoring it.'),
  ('Landed in Berlin for a new role. ESPRIT alumni here, let us grab a coffee.'),
  ('Wrote up how we cut our cloud bill by 35% without touching reliability. Thread incoming.'),
  ('First conference talk done ✅ Terrifying and amazing. Slides in comments.'),
  ('Looking to transition into ML. What would you study first in 2026?'),
  ('Shoutout to my promo 2017 crew — 9 years and still shipping together.'),
  ('We just closed our seed round. ESPRIT network referrals filled half our pipeline.'),
  ('Tip: write the README before the code. Forces you to think about the interface.'),
  ('Anyone going to the AI meetup next week? Would love to meet fellow alumni.'),
  ('Promotion update: I am now a Staff Engineer. Long road from promo 2013. Keep going.'),
  ('The job board here is underrated — got two interviews from a single post. 🙌')
) AS c(txt)
WHERE NOT EXISTS (SELECT 1 FROM posts p WHERE p.content = c.txt);

-- attach an image to ~half of the standalone feed posts
INSERT INTO attachments (id, post_id, file_url, mime_type, size_bytes, created_at, updated_at)
SELECT gen_random_uuid(), p.id,
       'https://picsum.photos/seed/post-' || left(md5(p.id::text), 10) || '/900/560',
       'image/jpeg', 140000, p.created_at, p.created_at
FROM posts p
WHERE p.group_id IS NULL
  AND random() < 0.5
  AND NOT EXISTS (SELECT 1 FROM attachments a WHERE a.post_id = p.id);

-- reactions: a handful per post from random users
INSERT INTO reactions (id, post_id, user_id, type, created_at, updated_at)
SELECT gen_random_uuid(), p.id, u.id,
       (ARRAY['LIKE','LIKE','LIKE','CELEBRATE','SUPPORT','INSIGHTFUL'])[1 + floor(random() * 6)::int],
       p.created_at + interval '1 hour', p.created_at + interval '1 hour'
FROM posts p
CROSS JOIN LATERAL (
  SELECT id FROM users ORDER BY random() LIMIT (3 + floor(random() * 25)::int)
) u
WHERE NOT EXISTS (SELECT 1 FROM reactions r WHERE r.post_id = p.id AND r.user_id = u.id);

-- comments: 0..3 per post
INSERT INTO comments (id, post_id, author_id, content, created_at, updated_at)
SELECT gen_random_uuid(), p.id,
       (SELECT id FROM users ORDER BY random() LIMIT 1),
       (ARRAY['Congrats! 🎉','This is huge.','Proud of you 👏','Let us connect.','Inspiring stuff.',
              'Great news!','Where can I apply?','DM sent.','Love this.','So well deserved.'])[1 + floor(random() * 10)::int],
       p.created_at + interval '2 hours', p.created_at + interval '2 hours'
FROM posts p
CROSS JOIN generate_series(1, floor(random() * 4)::int) g
WHERE p.group_id IS NULL;
