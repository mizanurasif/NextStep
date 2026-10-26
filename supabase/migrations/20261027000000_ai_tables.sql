-- First applied by hand in the SQL Editor, so every statement is safe to run again.
-- Applications stay in Firebase Realtime Database. These tables are a search index built from them,
-- so they can always be rebuilt.

create extension if not exists vector with schema extensions;

create table if not exists public.chunks (
  id bigint generated always as identity primary key,
  uid text not null,                 -- Firebase uid, taken from the verified token
  application_id text,               -- Realtime Database key; null for CV chunks
  source text not null check (source in ('circular', 'notes', 'cv', 'sop')),
  section text,
  content text not null,             -- the chunk, starting with its label line
  content_hash text not null,        -- unchanged text isn't embedded again
  embedding extensions.vector(768) not null,
  model text not null default 'gemini-embedding-2',
  fts tsvector generated always as (to_tsvector('english', content)) stored,  -- keyword half of hybrid search
  created_at timestamptz not null default now()
);

create index if not exists chunks_embedding_idx on public.chunks using hnsw (embedding extensions.vector_cosine_ops);  -- pgvector lives in the extensions schema
create index if not exists chunks_fts_idx on public.chunks using gin (fts);
create index if not exists chunks_owner_idx on public.chunks (uid, application_id);

-- Per-user daily limit, so one account can't use up the free Gemini quota
create table if not exists public.ai_usage (
  uid text not null,
  day date not null default current_date,
  requests int not null default 0,
  primary key (uid, day)
);

-- Deny by default: no policies, so the publishable key can't touch either table.
-- Only Edge Functions (secret key) can, and they filter by the uid from the verified Firebase token.
alter table public.chunks enable row level security;
alter table public.ai_usage enable row level security;
