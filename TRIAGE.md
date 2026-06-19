# UI Triage — Pass 3e

Audit of every interactive element. Status meanings:

- ✅ **Wired** — calls a real backend endpoint and updates UI on response
- 🪄 **Cosmetic-only, now stubbed** — clicking shows a "coming soon" toast instead of doing nothing
- 🚧 **Honest placeholder** — feature visibly labeled as future work (e.g. Map view banner, Calendar tab)
- 🔗 **Navigation** — `routerLink` to an existing page

A global toast host renders bottom-left in both layouts; every action surfaces success/error/info there so the user always knows whether anything happened.

---

## Front-office nav (top bar)

| Element | Status | Notes |
|---|---|---|
| Logo → `/` | 🔗 | |
| Feed / Directory / Mentorship / Jobs / Events / Groups | 🔗 | |
| Avatar + email → `/profile/me` | 🔗 | |
| Admin link (if ROLE_ADMIN) | 🔗 | |
| Logout | ✅ | `POST /auth/logout`, clears tokens, redirects |

## Landing (`/`)

| Element | Status | Notes |
|---|---|---|
| "Join the network →" | 🔗 | `/signup` |
| "Log in" | 🔗 | `/login` |

## Login / Signup

| Element | Status | Notes |
|---|---|---|
| Login form submit | ✅ | `POST /auth/login` |
| Signup form submit | ✅ | `POST /auth/signup` |
| Role picker, year picker, specialty picker | ✅ | Wired to form state, sent in payload |

## Feed (`/feed`)

| Element | Status | Notes |
|---|---|---|
| Post composer + "+ Post" | ✅ | `POST /posts`, success toast |
| ♡ React | ✅ | `POST /posts/:id/reactions`, toggle |
| 💬 Comment | ✅ | `POST /posts/:id/comments` via prompt() — inline thread is its own pass |
| ↗ Share | ✅ | Copies post link to clipboard, success toast |

## Directory (`/directory`)

| Element | Status | Notes |
|---|---|---|
| Search input | ✅ | Hits `/profiles?q=` on every keystroke |
| Grid / Map toggle | 🚧 | Map view shows honest placeholder + info toast — real Leaflet integration is a future pass |
| Filters · N pill | 🪄 | Toast: "Advanced filters — coming soon" |
| Profile card → public profile | 🔗 | `/profiles/:userId` |
| HIRING badge | ✅ | Renders when headline matches `/hiring|recruit/i` |
| **Message** button on card | 🪄 | Toast: "Direct message — coming soon". Real 1:1 messaging exists at `/messaging` but a "new conversation from profile" entry point isn't built |
| **View profile** (was Connect) | 🔗 | Renamed for honesty — leads to the public profile page |

## Public profile (`/profiles/:userId`)

| Element | Status | Notes |
|---|---|---|
| Tab navigation (About / Experience / Skills / Posts / Mentorship) | ✅ | |
| Endorse skill | ✅ | `POST /profiles/skills/:id/endorse` |
| Message / Connect buttons | 🪄 | UI only, kept for design fidelity — toast when wiring needed |
| ⬇ View CV (when set) | ✅ | Opens stored `cvUrl` in new tab |

## My profile (`/profile/me`)

| Element | Status | Notes |
|---|---|---|
| Edit profile toggle | ✅ | |
| Save (bio, headline, city, country, website, CV URL) | ✅ | `PATCH /profiles/me` + `PUT /profiles/me/cv` — success toast |
| Add / delete Experience | ✅ | `POST/DELETE /profiles/me/experiences` |
| Add / delete Skill | ✅ | `POST/DELETE /profiles/me/skills` |
| Add / delete Achievement | ✅ | `POST/DELETE /profiles/me/achievements` |
| **Posts tab** | 🚧 | Placeholder card pointing to `/feed` — pulling own posts inline is a small future task |
| **Mentorship tab** | 🚧 | Placeholder card pointing to `/mentorship/become` |
| **CV upload** | 🪄 | URL-only today. Real file upload (S3/MinIO) is its own pass |

## Jobs (`/jobs`)

| Element | Status | Notes |
|---|---|---|
| Search input | ✅ | `/jobs?q=` |
| "+ Post a job" (recruiter / admin only) | 🔗 | `/jobs/new` |
| All types / locations / Remote / Specialty filter buttons | 🪄 | Each shows a labeled "coming soon" toast |
| Job card → opens side detail panel | ✅ | Pure client state |
| Match % badge | 🚧 | Deterministic-from-id stand-in until a per-user match endpoint exists |
| **✨ Recommendations** (recruiter / admin only) | ✅ | `GET /recommendations/job/:id` — Ollama-powered with heuristic fallback |
| Drag-CV dropzone | 🪄 | Toast: in-app file upload coming soon; paste URL on `/profile/me` instead |
| **⚡ One-click apply** | ✅ | `POST /jobs/:id/apply` with the viewer's stored CV URL. Toast on success or "already applied" error |

## Job create (`/jobs/new`)

| Element | Status | Notes |
|---|---|---|
| Whole form | ✅ | `POST /jobs` — recruiter+admin only |

## Events (`/events`)

| Element | Status | Notes |
|---|---|---|
| "+ Create event" | 🔗 | `/events/new` |
| Cards / Calendar toggle | 🚧 | Calendar view shows honest placeholder; toast on click |
| Featured **Going** button | ✅ | `POST /events/:id/rsvp` with `GOING` — success toast, local count update |
| Featured **Share** button | ✅ | Copies event link to clipboard |
| Grid card **✓ RSVP** button | ✅ | Same RSVP endpoint as featured |
| Agenda + Speakers | 🚧 | Hardcoded display — Event entity doesn't model them yet, full schema is its own pass |

## Event create (`/events/new`)

| Element | Status | Notes |
|---|---|---|
| Whole form | ✅ | `POST /events` |

## Groups (`/groups`)

| Element | Status | Notes |
|---|---|---|
| "+ New group" | 🔗 | `/groups/new` |
| Filter chips (All / By promo / By specialty / By region / By interest / Women / Founders / Mentorship) | ✅ | Client-side filtering on the loaded set |
| **Join / Request to join / Open group** button | ✅ | `POST /groups/:id/members` — success toast |

## Group create (`/groups/new`)

| Element | Status | Notes |
|---|---|---|
| Whole form | ✅ | `POST /groups` |

## Mentorship (`/mentorship`)

| Element | Status | Notes |
|---|---|---|
| "+ Become a mentor" | 🔗 | `/mentorship/become` |
| **Find a mentor** tab | ✅ | Active state |
| **Become a mentor** card | 🔗 | Now a real link, was a static card |
| **My sessions** card | 🪄 | Toast: "Session calendar view — coming soon" |
| Match % on hero card | 🚧 | Deterministic-from-id stand-in until a per-user match endpoint exists |
| **× Pass** | ✅ | Drops the mentor from the in-memory list, info toast |
| **Save for later** | 🪄 | Toast: "Saved mentors list — coming soon" |
| **☼ Request a session** | ✅ | Prompts for goals, then `POST /mentorship/requests` |

## Mentor profile create (`/mentorship/become`)

| Element | Status | Notes |
|---|---|---|
| Whole form | ✅ | `PUT /mentorship/me` — alumni / mentor / admin only |

## Chat assistant widget

| Element | Status | Notes |
|---|---|---|
| Floating bubble (toggle open/close) | ✅ | |
| FR/EN locale toggle | ✅ | |
| Quick-prompt suggestions | ✅ | Each one fires `sendPrompt()` |
| Send (text input + ➤ button) | ✅ | `POST /assistant/chat` |
| Result cards inside the chat (alumnus / job / mentor) | 🔗 | Each navigates to the right page on click |
| Follow-up chips | ✅ | `sendPrompt(f.prompt)` |
| Error in conversation | ✅ | Renders as an assistant turn explaining Ollama may be offline |

## Admin — Overview (`/admin`)

| Element | Status | Notes |
|---|---|---|
| Stats tiles | ✅ | `GET /admin/stats` |

## Admin — Users (`/admin/users`)

| Element | Status | Notes |
|---|---|---|
| **Approve** | ✅ | `POST /admin/users/:id/approve` + success toast |
| **Suspend** | ✅ | `POST /admin/users/:id/suspend` + info toast |

## Admin — Moderation (`/admin/moderation`)

| Element | Status | Notes |
|---|---|---|
| Content-type tabs (Jobs / Events / Groups / Mentor profiles) | ✅ | |
| Status filters (PENDING / APPROVED / REJECTED) | ✅ | |
| **Approve** | ✅ | `POST /admin/moderation/:type/:id/approve` — triggers AI auto-notify for jobs |
| **Reject** | ✅ | `POST /admin/moderation/:type/:id/reject` — prompts for reason |
| Pending-count badges on tabs | ✅ | |

## Admin — Audit log (`/admin/audit`)

| Element | Status | Notes |
|---|---|---|
| List | ✅ | `GET /admin/audit-logs` |

---

## What's still missing (deliberately, called out)

These are not bugs — they're features that haven't been built yet. Each would be a self-contained future pass:

| Feature | Scope estimate |
|---|---|
| Real Leaflet map in directory | 1 session |
| In-app CV file upload (MinIO + multipart endpoint) | 1 session |
| Per-user match-score endpoint for jobs / mentors | 1 session |
| Calendar view for events (Angular CDK month grid) | 1 session |
| Speakers + Agenda entities + CRUD | 1 session |
| Streaming chat via SSE | half a session |
| Profile → user's own posts in the Posts tab | 15 minutes |
| Inline comment thread expansion on feed posts | half a session |
| Advanced directory filters (specialty / promo range / country sidebar) | half a session |
| Real 1:1 "Message" entry point from a profile or directory card | half a session |

Pick whichever is highest-value next; the foundation is now consistent.
