-- Migration: fix_search_vector_simple_dict
-- Recrée search_vector comme colonne générée avec dictionnaire 'simple'
-- (l'ancienne utilisait 'french' → ratait les mots non-français)

-- 1. Supprimer l'ancien index GIN et la colonne générée
DROP INDEX IF EXISTS "idx_documents_fts";
ALTER TABLE documents DROP COLUMN IF EXISTS search_vector;

-- 2. Recréer la colonne générée avec 'simple'
ALTER TABLE documents
  ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', COALESCE(title,              '')), 'A') ||
      setweight(to_tsvector('simple', COALESCE("extractedText",    '')), 'B') ||
      setweight(to_tsvector('simple', COALESCE("originalFilename", '')), 'C')
      ) STORED;

-- 3. Recréer l'index GIN
CREATE INDEX "idx_documents_fts" ON documents USING GIN (search_vector);
