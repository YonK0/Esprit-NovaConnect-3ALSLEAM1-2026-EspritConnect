-- V13: seed the new badge codes added in the BadgeService expansion.
--
-- The user_badges table has a FK on badges(code). Inserting a UserBadge
-- with a code not present here throws SQLState 23503 which bubbles out as
-- the "An unexpected error occurred" the user sees on RSVP / repost /
-- profile-complete. We add the rows here so every code BadgeService now
-- emits can be persisted.
--
-- ON CONFLICT DO NOTHING — re-running this migration on a DB that already
-- has these rows (e.g. someone manually inserted them) is a no-op rather
-- than an error.

-- badges.icon is VARCHAR(8) — keep names short.
INSERT INTO badges (code, name, description, icon) VALUES
    ('SUPER_CONNECT',    'Super Connector',   '50+ accepted connections',          'globe'),
    ('INFLUENCER',       'Influencer',        '50+ posts',                          'target'),
    ('COMMUNITY',        'Community',         'Member of 3+ approved groups',       'users'),
    ('EVENT_GOER',       'Event Goer',        '3+ Going RSVPs',                     'ticket'),
    ('COMPLETE_PROFILE', 'Complete Profile',  'Headline + bio + avatar + 3 skills + 1 experience', 'star'),
    ('HELPER',           'Helper',            'Accepted a mentorship request',      'hands'),
    ('HIRING_MAGNET',    'Hiring Magnet',     'Recruiter with 3+ approved jobs',    'magnet'),
    ('APPLICANT',        'Active Applicant',  '3+ job applications submitted',      'mail')
ON CONFLICT (code) DO NOTHING;
