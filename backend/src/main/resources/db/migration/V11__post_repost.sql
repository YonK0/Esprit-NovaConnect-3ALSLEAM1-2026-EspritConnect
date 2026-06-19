-- V11: Post reposts.
--
-- A repost is a Post row that points to an *original* Post via
-- original_post_id. The repost can carry its own `content` (the user's
-- caption / commentary) but reuses the original's attachments and author
-- for display purposes — the frontend renders both stacked, LinkedIn-style.
--
-- We FK the original_post_id rather than copying fields so that if the
-- original is edited, every repost reflects the change. ON DELETE SET NULL
-- so deleting the original keeps the repost row as a "this post was
-- removed" placeholder rather than cascading.

ALTER TABLE posts
    ADD COLUMN original_post_id UUID
        REFERENCES posts(id) ON DELETE SET NULL;

CREATE INDEX idx_posts_original_post ON posts (original_post_id)
    WHERE original_post_id IS NOT NULL;
