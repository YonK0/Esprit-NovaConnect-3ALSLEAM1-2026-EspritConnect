-- V12: per-RSVP approval workflow.
--
-- The organizer of an event decides who actually gets in. Without approval,
-- an RSVP is a *request*; once approved, the attendee receives a styled
-- confirmation email with a .ics calendar attachment.
--
-- We add the approval state as a separate column (rather than collapsing it
-- into the existing `status` enum) because the two are orthogonal:
--   • `status` is the attendee's intent: GOING / MAYBE / NOT_GOING.
--   • `approval` is the organizer's decision: PENDING / APPROVED / REJECTED.
-- An attendee might say GOING and still be PENDING/REJECTED.

ALTER TABLE event_rsvps
    ADD COLUMN approval VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN approval_decided_at TIMESTAMPTZ,
    ADD COLUMN approval_decided_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_event_rsvps_approval ON event_rsvps (event_id, approval);
