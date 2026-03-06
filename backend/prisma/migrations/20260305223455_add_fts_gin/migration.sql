-- ── search_vector : colonne tsvector GENERATED STORED ──────────────────────
-- Indexe sur (title + extractedText) avec tokenizer français.
-- Maintenu automatiquement par PostgreSQL à chaque INSERT/UPDATE.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
  to_tsvector('french',
  coalesce(title, '') || ' ' || coalesce("extractedText", '')
  )
  ) STORED;

-- ── Index GIN : Full-Text Search ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_documents_fts
  ON documents USING GIN(search_vector);

-- ── Index GIN : userTags (JSONB array) ────────────────────────────────────
-- Permet le filtre ?userTags=logiciel,adobe via l'opérateur @>
CREATE INDEX IF NOT EXISTS idx_documents_user_tags_gin
  ON documents USING GIN((metadata->'userTags') jsonb_path_ops);
