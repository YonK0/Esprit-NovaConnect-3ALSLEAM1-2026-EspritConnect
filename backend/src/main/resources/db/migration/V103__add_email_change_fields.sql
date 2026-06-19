-- Support email change requests with verification
ALTER TABLE users ADD COLUMN pending_new_email VARCHAR(255) NULL;
