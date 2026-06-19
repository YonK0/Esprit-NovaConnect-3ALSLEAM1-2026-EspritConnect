-- Resources module: knowledge folders + file/link items with role-based upload
-- moderation. Item visibility is governed by `status`; students' uploads land
-- PENDING (server-derived), everyone else's are APPROVED.

CREATE TABLE resource_folders (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title            varchar(200) NOT NULL,
    description      text,
    cover_image_url  text,
    owner_avatar_url text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz
);

CREATE TABLE resource_items (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id        uuid NOT NULL REFERENCES resource_folders(id) ON DELETE CASCADE,
    type             varchar(16)  NOT NULL,
    title            varchar(255) NOT NULL,
    url              text,
    file_type        varchar(100),
    size             bigint,
    status           varchar(32)  NOT NULL DEFAULT 'PENDING',
    submitted_by     uuid,
    reviewed_by      uuid,
    rejection_reason text,
    reviewed_at      timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz
);
CREATE INDEX idx_resource_items_folder ON resource_items(folder_id);
CREATE INDEX idx_resource_items_status ON resource_items(status);

-- ── Seed folders (covers reuse the locally-bundled /assets/seed images) ──────
INSERT INTO resource_folders (title, description, cover_image_url, owner_avatar_url, created_at, updated_at) VALUES
 ('PFE BOOK 23-24', 'Final-year project (PFE) books for the 2023–2024 cohort.',
  '/assets/seed/events/1.jpg', '/assets/seed/portraits/men/3.jpg', now() - interval '250 days', now() - interval '20 days'),
 ('Employability Report', 'Annual employability & salary insights for ESPRIT graduates.',
  '/assets/seed/events/2.jpg', '/assets/seed/portraits/men/3.jpg', now() - interval '230 days', now() - interval '40 days'),
 ('Alumni Spotlights', 'Stories and interviews from the ESPRIT alumni community.',
  '/assets/seed/groups/5.jpg', '/assets/seed/portraits/men/3.jpg', now() - interval '245 days', now() - interval '60 days'),
 ('Stages d''été RDI - Groupe Esprit - 2023', 'Summer R&D internship offers, 2023.',
  '/assets/seed/posts/4.jpg', '/assets/seed/portraits/men/3.jpg', now() - interval '360 days', now() - interval '360 days'),
 ('Graduation Internships BOOK 22-23', 'Graduation internship catalogue for 2022–2023.',
  '/assets/seed/posts/6.jpg', '/assets/seed/portraits/men/3.jpg', now() - interval '560 days', now() - interval '120 days'),
 ('CV and Cover letter template', 'Templates and guidance to craft your CV and cover letter.',
  '/assets/seed/events/3.jpg', '/assets/seed/portraits/men/3.jpg', now() - interval '630 days', now() - interval '200 days');

-- A couple of APPROVED links per a few folders so item counts look realistic.
INSERT INTO resource_items (folder_id, type, title, url, status, submitted_by, reviewed_by, reviewed_at, created_at, updated_at)
SELECT f.id, 'LINK', x.title, x.url, 'APPROVED', a.id, a.id,
       now() - interval '15 days', now() - interval '15 days', now() - interval '15 days'
FROM resource_folders f
CROSS JOIN (VALUES
  ('Overview & guidelines', 'https://esprit.tn'),
  ('Submission portal',     'https://esprit.tn')
) AS x(title, url)
JOIN users a ON a.email = 'admin@esprit.tn'
WHERE f.title IN ('PFE BOOK 23-24', 'Employability Report', 'CV and Cover letter template');

-- One PENDING item from a student so the admin review queue has something to show.
INSERT INTO resource_items (folder_id, type, title, url, status, submitted_by, created_at, updated_at)
SELECT f.id, 'LINK', 'My internship report (draft)', 'https://esprit.tn', 'PENDING', s.id,
       now() - interval '2 days', now() - interval '2 days'
FROM resource_folders f
JOIN users s ON s.email = 'sami.bouaziz@espritconnect.tn'
WHERE f.title = 'Graduation Internships BOOK 22-23';
