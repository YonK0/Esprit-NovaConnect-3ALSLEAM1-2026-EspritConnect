-- Give the seeded demo profiles real face photos so avatars show across the app
-- (feed, directory, job candidates, mentorship, header). Uses pravatar.cc, whose
-- ?img=N (1..70) returns a stable face per index. Picked from a hash of the email
-- so each person gets a consistent, distinct face. Only fills empty avatars so a
-- real uploaded photo is never overwritten.

UPDATE profiles p
SET avatar_url = 'https://i.pravatar.cc/300?img=' || (1 + (abs(hashtext(u.email)) % 70)),
    updated_at = now()
FROM users u
WHERE u.id = p.user_id
  AND (p.avatar_url IS NULL OR p.avatar_url = '')
  AND (
    u.email LIKE '%@espritconnect.tn'
    OR u.email IN (
        'admin@esprit.tn','amal.dridi@esprit.tn','omar.kthiri@esprit.tn','recruiter@vincit.ai',
        'david.lemoine@vincit.ai','julia.weber@hire.de','omar.recruit@gulftalent.ae'
    )
  );
