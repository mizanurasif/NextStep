-- The RAG search index is retired: questions now go to the research agent (functions/ai/research.ts),
-- which reads applications straight from Realtime Database and searches the web.
-- ai_usage and use_ai_quota stay; they still count every AI request.

drop function if exists public.match_chunks(text, extensions.vector, text, int, text);
drop table if exists public.chunks;
-- Only the search index used pgvector
drop extension if exists vector;

notify pgrst, 'reload schema';
