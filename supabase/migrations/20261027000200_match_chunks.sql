-- Hybrid search over one user's chunks: meaning (vector) + exact words (full-text),
-- merged with reciprocal rank fusion. Vector search alone misses exact terms like "IELTS 7.0" or
-- "React Native"; keyword search alone misses paraphrases like "salary" vs "compensation".
create or replace function public.match_chunks(
  p_uid text,
  p_query_embedding extensions.vector(768),
  p_query_text text,
  p_count int default 8,
  p_application_id text default null
)
returns table (id bigint, application_id text, source text, section text, content text, score double precision)
language sql
stable
-- pgvector's <=> operator lives in the extensions schema
set search_path = public, extensions, pg_catalog
as $$
  with semantic as (
    select c.id, row_number() over (order by c.embedding <=> p_query_embedding) as rank
    from public.chunks c
    where c.uid = p_uid and (p_application_id is null or c.application_id = p_application_id)
    order by c.embedding <=> p_query_embedding
    limit p_count * 3
  ),
  keyword as (
    select c.id, row_number() over (order by ts_rank_cd(c.fts, q) desc) as rank
    from public.chunks c, websearch_to_tsquery('english', p_query_text) q
    where c.uid = p_uid and (p_application_id is null or c.application_id = p_application_id) and c.fts @@ q
    order by ts_rank_cd(c.fts, q) desc
    limit p_count * 3
  )
  -- 60 is the usual RRF constant: it stops the very top rank of one list from outweighing everything else
  select c.id, c.application_id, c.source, c.section, c.content,
         coalesce(1.0 / (60 + s.rank), 0) + coalesce(1.0 / (60 + k.rank), 0) as score
  from semantic s
  full outer join keyword k on k.id = s.id
  join public.chunks c on c.id = coalesce(s.id, k.id)
  order by score desc
  limit p_count;
$$;

-- Only the Edge Function (secret key) may search, and it always passes the verified uid
revoke execute on function public.match_chunks(text, extensions.vector, text, int, text) from public, anon, authenticated;
grant execute on function public.match_chunks(text, extensions.vector, text, int, text) to service_role;

notify pgrst, 'reload schema';
