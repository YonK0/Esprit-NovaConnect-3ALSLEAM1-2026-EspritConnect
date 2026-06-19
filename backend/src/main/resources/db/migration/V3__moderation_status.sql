-- Add moderation_status to content that admins must approve before publishing.

ALTER TABLE job_offers
    ADD COLUMN moderation_status VARCHAR(32) NOT NULL DEFAULT 'PENDING';

ALTER TABLE events
    ADD COLUMN moderation_status VARCHAR(32) NOT NULL DEFAULT 'PENDING';

ALTER TABLE groups
    ADD COLUMN moderation_status VARCHAR(32) NOT NULL DEFAULT 'PENDING';

ALTER TABLE mentor_profiles
    ADD COLUMN moderation_status VARCHAR(32) NOT NULL DEFAULT 'PENDING';

-- Anything that already existed before this migration is grandfathered in as APPROVED
-- so the existing seed content stays visible.
UPDATE job_offers      SET moderation_status = 'APPROVED' WHERE moderation_status = 'PENDING';
UPDATE events          SET moderation_status = 'APPROVED' WHERE moderation_status = 'PENDING';
UPDATE groups          SET moderation_status = 'APPROVED' WHERE moderation_status = 'PENDING';
UPDATE mentor_profiles SET moderation_status = 'APPROVED' WHERE moderation_status = 'PENDING';

CREATE INDEX idx_jobs_moderation   ON job_offers      (moderation_status);
CREATE INDEX idx_events_moderation ON events          (moderation_status);
CREATE INDEX idx_groups_moderation ON groups          (moderation_status);
CREATE INDEX idx_mentor_moderation ON mentor_profiles (moderation_status);
