-- Replace the random demo avatars (V108) with gender-matched face photos.
-- randomuser.me serves stable, gendered portraits: /men/{n}.jpg and /women/{n}.jpg.
-- Mapping is explicit per seed email (we know each demo person's gender).
-- Only the seed accounts are touched; real uploads are never affected.

UPDATE profiles p
SET avatar_url = g.url, updated_at = now()
FROM (VALUES
  -- women
  ('amal.dridi@esprit.tn',              'https://randomuser.me/api/portraits/women/1.jpg'),
  ('nour.benali@espritconnect.tn',      'https://randomuser.me/api/portraits/women/2.jpg'),
  ('wejden.ghabarou@espritconnect.tn',  'https://randomuser.me/api/portraits/women/3.jpg'),
  ('rania.khelifi@espritconnect.tn',    'https://randomuser.me/api/portraits/women/4.jpg'),
  ('ines.chaabane@espritconnect.tn',    'https://randomuser.me/api/portraits/women/5.jpg'),
  ('syrine.hamdi@espritconnect.tn',     'https://randomuser.me/api/portraits/women/6.jpg'),
  ('olfa.bennour@espritconnect.tn',     'https://randomuser.me/api/portraits/women/7.jpg'),
  ('dorra.melliti@espritconnect.tn',    'https://randomuser.me/api/portraits/women/8.jpg'),
  ('maha.brahem@espritconnect.tn',      'https://randomuser.me/api/portraits/women/9.jpg'),
  ('hela.guesmi@espritconnect.tn',      'https://randomuser.me/api/portraits/women/10.jpg'),
  ('nadia.cherif@espritconnect.tn',     'https://randomuser.me/api/portraits/women/11.jpg'),
  ('leila.haddad@espritconnect.tn',     'https://randomuser.me/api/portraits/women/12.jpg'),
  ('sonia.maaloul@espritconnect.tn',    'https://randomuser.me/api/portraits/women/13.jpg'),
  ('fatma.kallel@espritconnect.tn',     'https://randomuser.me/api/portraits/women/14.jpg'),
  ('asma.nasri@espritconnect.tn',       'https://randomuser.me/api/portraits/women/15.jpg'),
  ('marie.dubois@espritconnect.tn',     'https://randomuser.me/api/portraits/women/16.jpg'),
  ('sarah.cohen@espritconnect.tn',      'https://randomuser.me/api/portraits/women/17.jpg'),
  ('julia.weber@hire.de',               'https://randomuser.me/api/portraits/women/18.jpg'),
  ('mariem.bouchhima@espritconnect.tn', 'https://randomuser.me/api/portraits/women/19.jpg'),
  ('selma.riahi@espritconnect.tn',      'https://randomuser.me/api/portraits/women/20.jpg'),
  -- men
  ('admin@esprit.tn',                   'https://randomuser.me/api/portraits/men/1.jpg'),
  ('omar.kthiri@esprit.tn',             'https://randomuser.me/api/portraits/men/2.jpg'),
  ('recruiter@vincit.ai',               'https://randomuser.me/api/portraits/men/3.jpg'),
  ('sami.bouaziz@espritconnect.tn',     'https://randomuser.me/api/portraits/men/4.jpg'),
  ('yassine.trabelsi@espritconnect.tn', 'https://randomuser.me/api/portraits/men/5.jpg'),
  ('aziz.mansour@espritconnect.tn',     'https://randomuser.me/api/portraits/men/6.jpg'),
  ('moataz.marouani@espritconnect.tn',  'https://randomuser.me/api/portraits/men/7.jpg'),
  ('abdallah.neifar@espritconnect.tn',  'https://randomuser.me/api/portraits/men/8.jpg'),
  ('wassim.gabsi@espritconnect.tn',     'https://randomuser.me/api/portraits/men/9.jpg'),
  ('hatem.zouari@espritconnect.tn',     'https://randomuser.me/api/portraits/men/10.jpg'),
  ('firas.ayadi@espritconnect.tn',      'https://randomuser.me/api/portraits/men/11.jpg'),
  ('anis.sassi@espritconnect.tn',       'https://randomuser.me/api/portraits/men/12.jpg'),
  ('sofien.lahmar@espritconnect.tn',    'https://randomuser.me/api/portraits/men/13.jpg'),
  ('bilel.rekik@espritconnect.tn',      'https://randomuser.me/api/portraits/men/14.jpg'),
  ('ramzi.bensalah@espritconnect.tn',   'https://randomuser.me/api/portraits/men/15.jpg'),
  ('amine.toumi@espritconnect.tn',      'https://randomuser.me/api/portraits/men/16.jpg'),
  ('karim.fakhfakh@espritconnect.tn',   'https://randomuser.me/api/portraits/men/17.jpg'),
  ('walid.benamor@espritconnect.tn',    'https://randomuser.me/api/portraits/men/18.jpg'),
  ('tarek.benyoussef@espritconnect.tn', 'https://randomuser.me/api/portraits/men/19.jpg'),
  ('lucas.martin@espritconnect.tn',     'https://randomuser.me/api/portraits/men/20.jpg'),
  ('david.lemoine@vincit.ai',           'https://randomuser.me/api/portraits/men/21.jpg'),
  ('omar.recruit@gulftalent.ae',        'https://randomuser.me/api/portraits/men/22.jpg'),
  ('youssef.gargouri@espritconnect.tn', 'https://randomuser.me/api/portraits/men/23.jpg'),
  ('zied.kacem@espritconnect.tn',       'https://randomuser.me/api/portraits/men/24.jpg')
) AS g(email, url)
JOIN users u ON u.email = g.email
WHERE p.user_id = u.id;
