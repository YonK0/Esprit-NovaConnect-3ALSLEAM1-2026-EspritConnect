-- Add open_to_work flag to users table
ALTER TABLE users ADD COLUMN open_to_work BOOLEAN NOT NULL DEFAULT FALSE;
