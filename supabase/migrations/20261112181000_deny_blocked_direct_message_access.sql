drop policy if exists "Participants read direct messages" on public.crew_direct_messages;
create policy "Participants read direct messages" on public.crew_direct_messages
 for select to authenticated
 using (
   (sender_id = (select auth.uid())::text or recipient_id = (select auth.uid())::text)
   and (select public.crew_can_message(case when sender_id=(select auth.uid())::text then recipient_id else sender_id end))
 );