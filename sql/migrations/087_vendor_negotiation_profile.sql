-- 087_vendor_negotiation_profile.sql
-- Adds vendor-selectable negotiation profile for Tukibot.

alter table vendor_bot_config
  add column if not exists negotiation_profile text not null default 'balanced';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vendor_bot_config_negotiation_profile_check'
  ) then
    alter table vendor_bot_config
      add constraint vendor_bot_config_negotiation_profile_check
      check (negotiation_profile in ('balanced', 'high_close', 'high_margin'));
  end if;
end
$$;
