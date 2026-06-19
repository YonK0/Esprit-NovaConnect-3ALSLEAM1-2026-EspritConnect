package tn.esprit.connect.modules.permissions;

import tn.esprit.connect.modules.user.entity.Role;

import java.util.EnumSet;
import java.util.Set;

/**
 * Fine-grained permissions an admin can revoke from individual users.
 *
 * Each constant has a `defaultRoles` set — the roles that *normally* hold
 * this permission. PermissionService uses it to decide the baseline:
 *   - Role grants the permission unless the user has an explicit revocation row
 *   - Role doesn't grant the permission → denied regardless
 *
 * To add a new permission: declare a new constant, list the roles that get
 * it by default, and call {@code permissionService.require(user, code)} at
 * the controller / service entrypoint.
 */
public enum Permission {

    /** Create a feed post (text + media). */
    POST_CREATE        (Role.STUDENT, Role.ALUMNI, Role.MENTOR, Role.RECRUITER, Role.ADMIN),
    /** Comment on posts. */
    POST_COMMENT       (Role.STUDENT, Role.ALUMNI, Role.MENTOR, Role.RECRUITER, Role.ADMIN),
    /** Repost / share another user's post. */
    POST_REPOST        (Role.STUDENT, Role.ALUMNI, Role.MENTOR, Role.RECRUITER, Role.ADMIN),

    /** Create a job offer (recruiters + admins). */
    JOB_CREATE         (Role.RECRUITER, Role.ADMIN),
    /** Apply to a job offer (everyone except recruiters by default). */
    JOB_APPLY          (Role.STUDENT, Role.ALUMNI, Role.MENTOR, Role.ADMIN),

    /** Create an event (submitted for admin review unless posted by an admin). */
    EVENT_CREATE       (Role.STUDENT, Role.ALUMNI, Role.MENTOR, Role.RECRUITER, Role.ADMIN),
    /** RSVP to an event. */
    EVENT_RSVP         (Role.STUDENT, Role.ALUMNI, Role.MENTOR, Role.RECRUITER, Role.ADMIN),

    /** Create a group. */
    GROUP_CREATE       (Role.STUDENT, Role.ALUMNI, Role.MENTOR, Role.RECRUITER, Role.ADMIN),
    /** Join a group. */
    GROUP_JOIN         (Role.STUDENT, Role.ALUMNI, Role.MENTOR, Role.RECRUITER, Role.ADMIN),

    /** Offer mentorship (i.e. create a mentor profile). */
    MENTORSHIP_OFFER   (Role.ALUMNI, Role.MENTOR, Role.ADMIN),
    /** Request mentorship from another user. */
    MENTORSHIP_REQUEST (Role.STUDENT, Role.ALUMNI, Role.MENTOR, Role.RECRUITER, Role.ADMIN),

    /** Send a direct message. */
    MESSAGING_SEND     (Role.STUDENT, Role.ALUMNI, Role.MENTOR, Role.RECRUITER, Role.ADMIN),
    /** Send a connection request. */
    CONNECTION_REQUEST (Role.STUDENT, Role.ALUMNI, Role.MENTOR, Role.RECRUITER, Role.ADMIN);

    private final Set<Role> defaultRoles;

    Permission(Role... defaultRoles) {
        this.defaultRoles = EnumSet.copyOf(java.util.Arrays.asList(defaultRoles));
    }

    /** Does this role grant the permission by default? */
    public boolean grantedByDefaultFor(Role role) {
        return defaultRoles.contains(role);
    }
}
