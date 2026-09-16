-- group_messages didn't exist when 0008 granted table access to the
-- authenticated role, so it was missed — same class of gap, same fix.
grant select, insert, update, delete on public.group_messages to authenticated;
