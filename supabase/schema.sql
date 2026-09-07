-- Shorts Generator MVP — schema (paste into the Supabase SQL editor)

create extension if not exists pgcrypto;

-- Loop A: outlier videos and their transcripts
create table reference_videos (
  id              uuid primary key default gen_random_uuid(),
  creator         text not null,
  youtube_id      text not null unique,
  title           text not null,
  views           bigint not null,
  multiple        numeric(6,2) not null,
  transcript      text not null,
  structure_json  jsonb,
  created_at      timestamptz not null default now()
);

create index reference_videos_creator_idx on reference_videos (creator);

-- Loop B: one row per short being made
create type job_status as enum (
  'generating', 'script_ready', 'approved', 'audio', 'rendering', 'ready', 'failed'
);

create table jobs (
  id                  uuid primary key default gen_random_uuid(),
  topic               text not null,
  reference_video_id  uuid not null references reference_videos (id),
  facts_json          jsonb,
  script              text,
  audio_url           text,
  video_url           text,
  heygen_job_id       text,
  status              job_status not null default 'generating',
  error               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Cron reconcile looks for jobs stuck in 'rendering'.
create index jobs_status_updated_at_idx on jobs (status, updated_at);
create unique index jobs_heygen_job_id_idx on jobs (heygen_job_id) where heygen_job_id is not null;

create function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger jobs_set_updated_at
  before update on jobs
  for each row execute function set_updated_at();

-- No RLS policies: every read and write goes through the service key on the server.
alter table reference_videos enable row level security;
alter table jobs enable row level security;

-- Storage bucket for mp3 and mp4. Public reads so HeyGen can fetch the audio
-- and the page can play the video; writes still require the service key.
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;
