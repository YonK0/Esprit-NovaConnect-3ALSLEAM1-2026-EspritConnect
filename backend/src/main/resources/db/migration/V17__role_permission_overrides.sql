-- Role-level permission overrides. When a row exists for (role, permission_code),
-- its `allowed` flag overrides the hardcoded default in the Permission enum for
-- every user with that role. Lets admins manage permissions by role from the panel.
create table role_permission_overrides (
    role            varchar(32)  not null,
    permission_code varchar(64)  not null,
    allowed         boolean      not null,
    updated_at      timestamptz  not null default now(),
    primary key (role, permission_code)
);
