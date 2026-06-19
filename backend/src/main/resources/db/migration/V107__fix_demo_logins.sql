-- Make the seeded demo accounts actually loggable.
--
-- Root cause: the password hash inherited from V99 never matched "Test@1234",
-- and the seed never set email_verified / status — but login() requires a
-- matching password AND email_verified = true AND status = ACTIVE.
--
-- We let Postgres compute a real BCrypt hash via pgcrypto, so it is guaranteed
-- to verify against the app's BCryptPasswordEncoder(12) (plain $2a$ bcrypt, no
-- {id} prefix). Targets only the seed fixtures (V99/V100) and the V106 demo
-- users — never real sign-ups.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE users
SET password_hash = crypt('Test@1234', gen_salt('bf', 12)),
    email_verified = true,
    status         = 'ACTIVE',
    updated_at     = now()
WHERE email LIKE '%@espritconnect.tn'
   OR email IN (
        'admin@esprit.tn',
        'amal.dridi@esprit.tn',
        'omar.kthiri@esprit.tn',
        'recruiter@vincit.ai',
        'david.lemoine@vincit.ai',
        'julia.weber@hire.de',
        'omar.recruit@gulftalent.ae'
   );
