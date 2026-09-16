-- Free-text bio; deliberately `text` with no check constraint so there's no
-- character limit.
alter table public.profiles add column bio text;
