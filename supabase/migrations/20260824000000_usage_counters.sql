-- Daily usage counters for the public demo.
--
-- The backend runs as serverless functions that share no memory, so a counter
-- held in a process only ever sees the slice of traffic that landed on that
-- instance. Counting in Postgres is what makes "50 questions per visitor per
-- day" and "1000 across the whole deployment" mean anything.

create table if not exists public.usage_counters (
    bucket text not null,
    day date not null,
    count integer not null default 0,
    primary key (bucket, day)
);

-- Row-level security with no policies: the anon key that ships in the browser
-- bundle gets nothing. The backend reaches this through the service-role key,
-- which bypasses RLS, and is the only thing that should ever touch it.
alter table public.usage_counters enable row level security;

-- Increment today's counter and return the new value.
--
-- The insert ... on conflict is one statement, so two requests arriving at the
-- same instant cannot both read the same count and write the same total back.
-- Doing this read-modify-write in Python would let a burst slip past the cap.
create or replace function public.bump_usage(p_bucket text)
returns integer
language plpgsql
as $$
declare
    new_count integer;
begin
    insert into public.usage_counters (bucket, day, count)
    values (p_bucket, (now() at time zone 'utc')::date, 1)
    on conflict (bucket, day) do update
        set count = public.usage_counters.count + 1
    returning count into new_count;

    return new_count;
end;
$$;

-- Nothing but the service role should be able to move the counter. Without
-- this, anyone holding the public anon key could call the function over
-- PostgREST and inflate the global count until the demo refuses everyone.
revoke execute on function public.bump_usage(text) from public, anon, authenticated;
