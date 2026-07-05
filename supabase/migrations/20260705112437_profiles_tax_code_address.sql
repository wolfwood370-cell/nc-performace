alter table public.profiles
  add column if not exists tax_code text,
  add column if not exists address  text;
