-- Mark a believable subset of seed users as identity-verified, so the blue
-- "verified" badge (ec-verified-badge) shows next to their name in the
-- directory and on their profile. The badge UI + ProfileResponse.identityVerified
-- already exist; this just supplies the demo data.
--
-- Verified: all mentors, recruiters and the admin (senior / vetted accounts),
-- plus a curated set of notable alumni. Everyone else stays unverified so the
-- badge reads as meaningful rather than universal.

UPDATE users
SET identity_verified = true,
    verified_at = now(),
    updated_at = now()
WHERE role IN ('MENTOR', 'RECRUITER', 'ADMIN')
   OR email IN (
       'rania.khelifi@espritconnect.tn',
       'ines.chaabane@espritconnect.tn',
       'olfa.bennour@espritconnect.tn',
       'firas.ayadi@espritconnect.tn',
       'hela.guesmi@espritconnect.tn',
       'nadia.cherif@espritconnect.tn',
       'marie.dubois@espritconnect.tn',
       'youssef.gargouri@espritconnect.tn',
       'moataz.marouani@espritconnect.tn',
       'abdallah.neifar@espritconnect.tn',
       'wejden.ghabarou@espritconnect.tn',
       'omar.kthiri@esprit.tn'
   );
