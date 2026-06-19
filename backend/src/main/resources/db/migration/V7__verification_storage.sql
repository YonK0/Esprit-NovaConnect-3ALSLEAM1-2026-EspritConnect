-- Phase 4 (MinIO upload slice): add a JSONB column to verification_attempts
-- so the face step can store the 3 frame keys without proliferating columns.
--
-- id_file_url and secondary_file_url already exist (Phase 1) and are reused.

ALTER TABLE verification_attempts
    ADD COLUMN frame_keys JSONB;
