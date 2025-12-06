ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "searchVector" tsvector;

UPDATE "Post"
SET "searchVector" =
  setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("description", '')), 'B') ||
  setweight(to_tsvector('english', coalesce("code", '')), 'C');

CREATE INDEX IF NOT EXISTS "Post_searchVector_idx"
  ON "Post" USING GIN ("searchVector");

CREATE OR REPLACE FUNCTION update_post_search_vector() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('english', coalesce(NEW."title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW."description", '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW."code", '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS post_search_vector_trigger ON "Post";
CREATE TRIGGER post_search_vector_trigger
BEFORE INSERT OR UPDATE OF "title", "description", "code" ON "Post"
FOR EACH ROW EXECUTE FUNCTION update_post_search_vector();
