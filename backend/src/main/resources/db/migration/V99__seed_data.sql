-- Seed data for development.
-- All passwords below are BCrypt(12) hash of "Test@1234"
-- Computed from the source: "Test@1234" -> $2a$12$...

-- Specialties
INSERT INTO specialties (id, code, name, created_at, updated_at) VALUES
  (gen_random_uuid(), 'GL',         'Génie Logiciel',           now(), now()),
  (gen_random_uuid(), 'RT',         'Réseaux & Télécoms',       now(), now()),
  (gen_random_uuid(), 'IA',         'Intelligence Artificielle', now(), now()),
  (gen_random_uuid(), 'INFOTRONIC', 'Infotronic',                now(), now()),
  (gen_random_uuid(), 'CIVIL',      'Génie Civil',               now(), now()),
  (gen_random_uuid(), 'MECA',       'Génie Mécanique',           now(), now()),
  (gen_random_uuid(), 'ERP',        'ERP / BI',                  now(), now())
ON CONFLICT (code) DO NOTHING;

-- Promotions 2010..2025
INSERT INTO promotions (id, year, department, created_at, updated_at)
SELECT gen_random_uuid(), y, 'ESPRIT', now(), now()
FROM generate_series(2010, 2025) AS y
ON CONFLICT (year, department) DO NOTHING;

-- Admin user (Test@1234)
WITH new_admin AS (
  INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
  VALUES (gen_random_uuid(), 'admin@esprit.tn',
          '$2a$12$VxKzQH8aVFIK60jgRdJ9m.O7KzS8zjlxg.LxA8fD4vfmI3lP1l8oS',
          'ADMIN', 'ACTIVE', now(), now())
  ON CONFLICT (email) DO NOTHING
  RETURNING id
)
INSERT INTO profiles (id, user_id, first_name, last_name, headline,
                     promotion_id, specialty_id, is_searchable, created_at, updated_at)
SELECT gen_random_uuid(), na.id, 'Admin', 'ESPRIT', 'Platform admin',
       (SELECT id FROM promotions WHERE year = 2015 LIMIT 1),
       (SELECT id FROM specialties WHERE code = 'GL'),
       true, now(), now()
FROM new_admin na;

-- Demo alumni
WITH new_alum AS (
  INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
  VALUES (gen_random_uuid(), 'amal.dridi@esprit.tn',
          '$2a$12$VxKzQH8aVFIK60jgRdJ9m.O7KzS8zjlxg.LxA8fD4vfmI3lP1l8oS',
          'ALUMNI', 'ACTIVE', now(), now())
  ON CONFLICT (email) DO NOTHING
  RETURNING id
)
INSERT INTO profiles (id, user_id, first_name, last_name, headline, country, city,
                     promotion_id, specialty_id, is_searchable, created_at, updated_at)
SELECT gen_random_uuid(), na.id, 'Amal', 'DRIDI',
       'Software Engineer · Datadog · Paris', 'France', 'Paris',
       (SELECT id FROM promotions WHERE year = 2014 LIMIT 1),
       (SELECT id FROM specialties WHERE code = 'GL'),
       true, now(), now()
FROM new_alum na;

WITH new_alum AS (
  INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
  VALUES (gen_random_uuid(), 'omar.kthiri@esprit.tn',
          '$2a$12$VxKzQH8aVFIK60jgRdJ9m.O7KzS8zjlxg.LxA8fD4vfmI3lP1l8oS',
          'ALUMNI', 'ACTIVE', now(), now())
  ON CONFLICT (email) DO NOTHING
  RETURNING id
)
INSERT INTO profiles (id, user_id, first_name, last_name, headline, country, city,
                     promotion_id, specialty_id, is_searchable, created_at, updated_at)
SELECT gen_random_uuid(), na.id, 'Omar', 'KTHIRI',
       'ML Engineer · Meta · London', 'United Kingdom', 'London',
       (SELECT id FROM promotions WHERE year = 2018 LIMIT 1),
       (SELECT id FROM specialties WHERE code = 'IA'),
       true, now(), now()
FROM new_alum na;

WITH new_recruiter AS (
  INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
  VALUES (gen_random_uuid(), 'recruiter@vincit.ai',
          '$2a$12$VxKzQH8aVFIK60jgRdJ9m.O7KzS8zjlxg.LxA8fD4vfmI3lP1l8oS',
          'RECRUITER', 'ACTIVE', now(), now())
  ON CONFLICT (email) DO NOTHING
  RETURNING id
)
INSERT INTO profiles (id, user_id, first_name, last_name, headline,
                     promotion_id, specialty_id, is_searchable, created_at, updated_at)
SELECT gen_random_uuid(), nr.id, 'Recruiter', 'Vincit', 'Talent · Vincit AI',
       (SELECT id FROM promotions WHERE year = 2019 LIMIT 1),
       (SELECT id FROM specialties WHERE code = 'IA'),
       true, now(), now()
FROM new_recruiter nr;
