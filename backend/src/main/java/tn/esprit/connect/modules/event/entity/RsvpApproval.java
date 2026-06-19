package tn.esprit.connect.modules.event.entity;

/**
 * Organizer's decision on an attendee's RSVP. Orthogonal to {@link RsvpStatus}
 * (the attendee's own intent: GOING / MAYBE / NOT_GOING).
 */
public enum RsvpApproval {
    /** Default state when an RSVP first arrives. Awaiting organizer review. */
    PENDING,
    /** Organizer accepted — the attendee will receive a confirmation email
     *  with a .ics calendar invite. */
    APPROVED,
    /** Organizer rejected — the attendee gets a polite email. They can
     *  still RSVP again, which moves them back to PENDING. */
    REJECTED
}
