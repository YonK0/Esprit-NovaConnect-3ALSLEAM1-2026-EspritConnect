-- LinkedIn-style profile expansion: CV URL, website, experiences, achievements, endorsements.

ALTER TABLE profiles ADD COLUMN cv_url      VARCHAR(512);
ALTER TABLE profiles ADD COLUMN website_url VARCHAR(512);

CREATE TABLE experiences (
    id          UUID PRIMARY KEY,
    profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title       VARCHAR(160) NOT NULL,
    company     VARCHAR(160) NOT NULL,
    location    VARCHAR(160),
    start_date  DATE NOT NULL,
    end_date    DATE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL,
    deleted_at  TIMESTAMPTZ
);
CREATE INDEX idx_experiences_profile ON experiences (profile_id);

CREATE TABLE achievements (
    id          UUID PRIMARY KEY,
    profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title       VARCHAR(160) NOT NULL,
    subtitle    VARCHAR(200),
    period      VARCHAR(64),
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL,
    deleted_at  TIMESTAMPTZ
);
CREATE INDEX idx_achievements_profile ON achievements (profile_id);

CREATE TABLE endorsements (
    id          UUID PRIMARY KEY,
    skill_id    UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    endorser_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL,
    deleted_at  TIMESTAMPTZ,
    UNIQUE (skill_id, endorser_id)
);
CREATE INDEX idx_endorsements_skill ON endorsements (skill_id);
