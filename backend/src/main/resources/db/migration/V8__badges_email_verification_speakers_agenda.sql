-- V8: badges, email verification tokens, event speakers & agenda items

-- ─── Email verification on users ────────────────────────────────────────────
ALTER TABLE users ADD COLUMN email_verified       BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN ev_token             VARCHAR(128);
ALTER TABLE users ADD COLUMN ev_token_expires_at  TIMESTAMPTZ;

-- ─── Badges reference table + user_badges ───────────────────────────────────
CREATE TABLE badges (
    code        VARCHAR(32)  PRIMARY KEY,
    name        VARCHAR(80)  NOT NULL,
    description VARCHAR(256),
    icon        VARCHAR(8)
);

INSERT INTO badges (code, name, description, icon) VALUES
    ('VERIFIED',   'Verified',      'Identity verified via document + face recognition', '✓'),
    ('ALUMNI',     'Alumni',        'Verified ESPRIT graduate',                          '🎓'),
    ('MENTOR',     'Mentor',        'Active mentor on the platform',                     '🧭'),
    ('RECRUITER',  'Recruiter',     'Verified employer / recruiter',                     '🏢'),
    ('CONNECTOR',  'Connector',     'Reached 10 accepted connections',                   '🔗'),
    ('EARLY_BIRD', 'Early Adopter', 'Among the first 100 members',                      '🐦'),
    ('TOP_POSTER', 'Top Poster',    'Published 20 or more posts',                        '✍');

CREATE TABLE user_badges (
    id          UUID        PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    badge_code  VARCHAR(32) NOT NULL REFERENCES badges(code),
    awarded_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL,
    deleted_at  TIMESTAMPTZ,
    UNIQUE (user_id, badge_code)
);
CREATE INDEX idx_user_badges_user ON user_badges (user_id);

-- ─── Event speakers ──────────────────────────────────────────────────────────
CREATE TABLE event_speakers (
    id          UUID         PRIMARY KEY,
    event_id    UUID         NOT NULL REFERENCES events(id)   ON DELETE CASCADE,
    profile_id  UUID                  REFERENCES profiles(id) ON DELETE SET NULL,
    name        VARCHAR(160) NOT NULL,
    role        VARCHAR(160),
    company     VARCHAR(160),
    bio         TEXT,
    avatar_url  VARCHAR(512),
    sort_order  INT          NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  NOT NULL,
    updated_at  TIMESTAMPTZ  NOT NULL,
    deleted_at  TIMESTAMPTZ
);
CREATE INDEX idx_event_speakers_event ON event_speakers (event_id);

-- ─── Event agenda items ──────────────────────────────────────────────────────
CREATE TABLE event_agenda_items (
    id          UUID         PRIMARY KEY,
    event_id    UUID         NOT NULL REFERENCES events(id)         ON DELETE CASCADE,
    speaker_id  UUID                  REFERENCES event_speakers(id) ON DELETE SET NULL,
    title       VARCHAR(200) NOT NULL,
    description TEXT,
    start_time  TIMESTAMPTZ,
    end_time    TIMESTAMPTZ,
    sort_order  INT          NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  NOT NULL,
    updated_at  TIMESTAMPTZ  NOT NULL,
    deleted_at  TIMESTAMPTZ
);
CREATE INDEX idx_event_agenda_event ON event_agenda_items (event_id);
