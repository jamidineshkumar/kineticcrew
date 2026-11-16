-- Daily personal motivation and dance/music facts with per-member no-repeat history.
create table if not exists public.crew_promotion_content (
  content_key text primary key,
  content_type text not null check (content_type in ('motivation','fun_fact')),
  body text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.crew_promotion_content(content_key,content_type,body) values
('motivation_001','motivation','Small steps done consistently create remarkable progress.'),
('motivation_002','motivation','Your future performance is built in today’s practice.'),
('motivation_003','motivation','Confidence grows every time you choose to show up.'),
('motivation_004','motivation','Progress is not always loud. Keep moving forward.'),
('motivation_005','motivation','Make today a little stronger than yesterday.'),
('motivation_006','motivation','Discipline keeps you moving when motivation gets quiet.'),
('motivation_007','motivation','Every rehearsal is a chance to improve one detail.'),
('motivation_008','motivation','You do not need perfect conditions to make progress.'),
('motivation_009','motivation','Keep your focus on the next step, not the whole staircase.'),
('motivation_010','motivation','The effort nobody sees becomes the performance everybody remembers.'),
('motivation_011','motivation','Consistency turns difficult moves into natural movement.'),
('motivation_012','motivation','A small improvement today is still a real win.'),
('motivation_013','motivation','Let your energy be bigger than your excuses.'),
('motivation_014','motivation','Mistakes are feedback. Use them to sharpen your next attempt.'),
('motivation_015','motivation','Your pace is valid. Keep moving at it.'),
('motivation_016','motivation','Great teams are built by people who keep showing up for one another.'),
('motivation_017','motivation','Practice with purpose; perform with freedom.'),
('motivation_018','motivation','Do it for the version of you who once wished to begin.'),
('motivation_019','motivation','One brave attempt can change the direction of your day.'),
('motivation_020','motivation','Stay curious, stay teachable, and keep getting better.'),
('motivation_021','motivation','Your next breakthrough may be one more try away.'),
('motivation_022','motivation','Bring good energy into the room and let it spread.'),
('motivation_023','motivation','Strong performances begin with patient preparation.'),
('motivation_024','motivation','You can reset, refocus, and start again at any moment.'),
('motivation_025','motivation','Make room for growth; you are still becoming.'),
('motivation_026','motivation','A team shines brightest when every member contributes.'),
('motivation_027','motivation','Turn nervous energy into focused action.'),
('motivation_028','motivation','Keep the rhythm, trust the work, and enjoy the process.'),
('motivation_029','motivation','You are allowed to learn while you lead.'),
('motivation_030','motivation','A little courage can make an ordinary day memorable.'),
('motivation_031','motivation','Do not compare your first step with someone else’s tenth.'),
('motivation_032','motivation','The details you practise today become your signature tomorrow.'),
('motivation_033','motivation','Choose progress over perfection, one attempt at a time.'),
('motivation_034','motivation','Your attitude can change the energy of the entire team.'),
('motivation_035','motivation','Keep creating moments you will be proud to remember.'),
('motivation_036','motivation','Rest when needed, then return with intention.'),
('motivation_037','motivation','Big goals become manageable when broken into small actions.'),
('motivation_038','motivation','Let setbacks teach you, not define you.'),
('motivation_039','motivation','Show up with heart; the skill will keep growing.'),
('motivation_040','motivation','Today is another chance to make your own momentum.'),
('fact_001','fun_fact','A standard musical octave contains 12 semitones in equal temperament.'),
('fact_002','fun_fact','The word choreography comes from Greek roots associated with dance and writing.'),
('fact_003','fun_fact','Tap dancing uses the shoes as percussion instruments.'),
('fact_004','fun_fact','A metronome helps musicians practise a steady tempo.'),
('fact_005','fun_fact','The human body has over 600 skeletal muscles working together for movement.'),
('fact_006','fun_fact','Ballet terminology uses many French words because of ballet’s development in French courts.'),
('fact_007','fun_fact','A beat is the regular pulse that helps listeners feel a piece of music’s timing.'),
('fact_008','fun_fact','The same song can feel different when its tempo or accent pattern changes.'),
('fact_009','fun_fact','A cappella means singing without instrumental accompaniment.'),
('fact_010','fun_fact','The word rhythm comes from a Greek word linked to measured flow or movement.'),
('fact_011','fun_fact','A syncopated rhythm places emphasis on beats or parts of beats that are usually weaker.'),
('fact_012','fun_fact','A group moving in unison performs the same movement at the same time.'),
('fact_013','fun_fact','Improvisation means creating movement spontaneously rather than following a fixed sequence.'),
('fact_014','fun_fact','A choreographer designs and arranges movement for a dance performance.'),
('fact_015','fun_fact','Warm-ups gradually prepare muscles and joints for more demanding activity.'),
('fact_016','fun_fact','A count of eight is a common way dancers organise and remember choreography.'),
('fact_017','fun_fact','Percussion instruments create sound by being struck, shaken, or scraped.'),
('fact_018','fun_fact','A duet is a performance created for two performers.'),
('fact_019','fun_fact','A crescendo is a gradual increase in musical loudness.'),
('fact_020','fun_fact','A musical rest is a written symbol that indicates silence for a specific duration.'),
('fact_021','fun_fact','The term tempo describes how fast or slow music is performed.'),
('fact_022','fun_fact','A formation change can make the same choreography look completely different on stage.'),
('fact_023','fun_fact','A mirror is often used in dance practice to help check alignment and movement details.'),
('fact_024','fun_fact','A playlist can be arranged by energy and tempo to shape the mood of a practice session.'),
('fact_025','fun_fact','A polyrhythm happens when two or more different rhythmic patterns occur together.'),
('fact_026','fun_fact','A solo is a performance featuring one performer.'),
('fact_027','fun_fact','The bass line often helps anchor the rhythm and harmony of a song.'),
('fact_028','fun_fact','A musical bridge connects sections and often adds contrast before the song returns to a familiar part.'),
('fact_029','fun_fact','A rehearsal is also a chance to practise spacing, timing, and teamwork—not just steps.'),
('fact_030','fun_fact','A round in group choreography is when performers begin the same phrase at different times.'),
('fact_031','fun_fact','The term dynamics describes changes in loudness and intensity in music.'),
('fact_032','fun_fact','A count-in gives performers a shared starting point before music or movement begins.'),
('fact_033','fun_fact','A soundtrack can use silence as well as sound to create dramatic effect.'),
('fact_034','fun_fact','A circle formation lets performers face inward, outward, or toward different audience directions.'),
('fact_035','fun_fact','A motif is a short movement idea that can be repeated or developed in choreography.'),
('fact_036','fun_fact','The speed of a song is commonly measured in beats per minute, or BPM.'),
('fact_037','fun_fact','A canon in dance repeats a movement phrase with performers starting one after another.'),
('fact_038','fun_fact','Stage blocking describes where performers move and stand during a performance.'),
('fact_039','fun_fact','A transition is the movement that connects one section of choreography to another.'),
('fact_040','fun_fact','Listening for the kick, snare, and bass can help dancers find different layers in a track.')
on conflict (content_key) do update set content_type=excluded.content_type, body=excluded.body, active=true;

create table if not exists public.crew_promotion_content_history (
  recipient_auth_id text not null references public.crew_profiles(auth_id) on delete cascade,
  content_key text not null references public.crew_promotion_content(content_key),
  first_scheduled_at timestamptz not null default now(),
  primary key (recipient_auth_id,content_key)
);
create index if not exists crew_promotion_content_history_recipient_idx
  on public.crew_promotion_content_history(recipient_auth_id,first_scheduled_at desc);
alter table public.crew_promotion_content enable row level security;
alter table public.crew_promotion_content_history enable row level security;
revoke all on public.crew_promotion_content from anon,authenticated;
revoke all on public.crew_promotion_content_history from anon,authenticated;

create or replace function public.crew_enqueue_daily_promotions()
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog','public','extensions'
as $function$
declare
  v_profile record;
  v_event record;
  v_content record;
  v_day date := (now() at time zone 'Asia/Kolkata')::date;
  v_due timestamptz;
  v_title text;
  v_body text;
  v_push_id uuid;
  v_source_id uuid;
  v_count integer := 0;
begin
  for v_profile in
    select p.auth_id
    from public.crew_profiles p
    where p.approval_status='approved'
      and p.promotional_updates_enabled=true
      and p.role in ('member','admin','super_admin')
      and exists(select 1 from public.crew_push_tokens t where t.auth_id=p.auth_id)
      and not exists(
        select 1 from public.crew_promotion_daily_log l
        where l.recipient_auth_id=p.auth_id and l.local_day=v_day
      )
  loop
    v_due := ((v_day::timestamp + time '09:00') at time zone 'Asia/Kolkata')
      + make_interval(mins => abs(hashtextextended(v_profile.auth_id||v_day::text,0)%660)::int);
    if now() < v_due then continue; end if;

    -- Event invitations retain priority when a member has an upcoming event with open seats.
    select e.id,e.title,
      greatest(e.capacity-(select count(*)::int from public.crew_registrations r where r.event_id=e.id),0) seats_left
    into v_event
    from public.crew_events e
    where e.starts_at>now()
      and coalesce(e.event_status,'scheduled') not in ('cancelled','postponed')
      and e.capacity>(select count(*) from public.crew_registrations r where r.event_id=e.id)
      and not exists(
        select 1 from public.crew_registrations r
        where r.event_id=e.id and r.member_id=v_profile.auth_id
      )
    order by e.starts_at asc
    limit 1;

    if found then
      v_title := 'Upcoming event: '||left(v_event.title,80);
      v_body := 'Registration is open — '||v_event.seats_left||' seat(s) remaining. Open Kinetic Crew to register.';
      v_source_id := v_event.id;
    else
      -- Choose only content this member has never received before.
      select c.content_key,c.content_type,c.body
      into v_content
      from public.crew_promotion_content c
      where c.active=true
        and not exists(
          select 1 from public.crew_promotion_content_history h
          where h.recipient_auth_id=v_profile.auth_id and h.content_key=c.content_key
        )
      order by random()
      limit 1;

      -- Once a member has seen the complete library, start a fresh cycle.
      -- No message repeats until all active items have been used once.
      if not found then
        delete from public.crew_promotion_content_history
        where recipient_auth_id=v_profile.auth_id;

        select c.content_key,c.content_type,c.body
        into v_content
        from public.crew_promotion_content c
        where c.active=true
        order by random()
        limit 1;

        if not found then
          continue;
        end if;
      end if;

      if v_content.content_type='motivation' then
        v_title := 'A little crew motivation ✨';
      else
        v_title := 'Daily dance & music fact 💡';
      end if;
      v_body := v_content.body;
      v_source_id := '00000000-0000-0000-0000-000000000000'::uuid;
    end if;

    insert into public.crew_scheduled_pushes(
      recipient_auth_id,source_type,source_id,notification_key,title,body,scheduled_at,status
    )
    values(
      v_profile.auth_id,'promotion',v_source_id,'promotion_'||to_char(v_day,'YYYYMMDD'),
      v_title,v_body,v_due,'pending'
    )
    on conflict (recipient_auth_id,source_type,source_id,notification_key) do nothing
    returning id into v_push_id;

    if v_push_id is not null then
      insert into public.crew_promotion_daily_log(recipient_auth_id,local_day,scheduled_push_id)
      values(v_profile.auth_id,v_day,v_push_id)
      on conflict (recipient_auth_id,local_day) do nothing;

      if v_source_id='00000000-0000-0000-0000-000000000000'::uuid then
        insert into public.crew_promotion_content_history(recipient_auth_id,content_key)
        values(v_profile.auth_id,v_content.content_key)
        on conflict do nothing;
      end if;
      v_count := v_count+1;
    end if;
  end loop;
  return v_count;
end;
$function$;
