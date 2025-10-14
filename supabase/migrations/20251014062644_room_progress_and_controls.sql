-- rooms: 컬럼만 선반영 (제약/NOT NULL은 후속 마이그에서 처리)
alter table quiz.rooms
    add column if not exists current_q int,
    add column if not exists state text;

alter table quiz.rooms
    alter column current_q set default 1,
alter column state set default 'idle';

-- 공개 조회(Realtime용) RLS (이미 켜져 있지 않다면 켬)
alter table quiz.rooms enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='quiz' and tablename='rooms' and policyname='rooms_select_public'
  ) then
    create policy rooms_select_public
      on quiz.rooms
      for select
                              to anon, authenticated
                              using (true);
end if;
end $$;

-- Realtime publication에 rooms도 추가
do $$
begin
begin
    alter publication supabase_realtime add table quiz.rooms;
exception when duplicate_object then null;
end;
end $$;

-- 진행 상태 조회(학생/교사 공용)
create or replace function quiz.get_room_progress(p_room uuid)
returns table (
  room_id uuid,
  state text,
  current_q int,
  total_q int
)
language sql
security definer
set search_path = quiz, public
as $$
select
    r.id as room_id,
    r.state,
    r.current_q,
    coalesce( (select count(*) from quiz.room_questions where room_id = r.id), 0)::int as total_q
from quiz.rooms r
where r.id = p_room
    $$;

revoke all on function quiz.get_room_progress(uuid) from public;
grant execute on function quiz.get_room_progress(uuid) to anon, authenticated;

-- 방 시작 (교사용)
create or replace function quiz.start_room(p_room uuid)
returns table (room_id uuid, state text, current_q int, total_q int)
language plpgsql
security definer
set search_path = quiz, public
as $$
declare v_total int;
begin
select count(*)::int into v_total from quiz.room_questions where room_id = p_room;
if v_total = 0 then
    raise exception 'room % has no questions', p_room using errcode='22023';
end if;

update quiz.rooms r
set state = 'running',
    current_q = 1
where r.id = p_room;

return query select * from quiz.get_room_progress(p_room);
end
$$;

revoke all on function quiz.start_room(uuid) from public;
grant execute on function quiz.start_room(uuid) to authenticated;

-- 다음 문항 (교사용)
create or replace function quiz.next_question(p_room uuid)
returns table (room_id uuid, state text, current_q int, total_q int)
language plpgsql
security definer
set search_path = quiz, public
as $$
declare v_total int; v_next int;
begin
select count(*)::int into v_total from quiz.room_questions where room_id = p_room;
if v_total = 0 then
    raise exception 'room % has no questions', p_room using errcode='22023';
end if;

select least(r.current_q + 1, v_total) into v_next
from quiz.rooms r where r.id = p_room;

update quiz.rooms r
set state = case when state='ended' then 'running' else state end,
    current_q = v_next
where r.id = p_room;

return query select * from quiz.get_room_progress(p_room);
end
$$;

revoke all on function quiz.next_question(uuid) from public;
grant execute on function quiz.next_question(uuid) to authenticated;

-- 이전 문항 (교사용)
create or replace function quiz.prev_question(p_room uuid)
returns table (room_id uuid, state text, current_q int, total_q int)
language plpgsql
security definer
set search_path = quiz, public
as $$
declare v_prev int;
begin
select greatest(r.current_q - 1, 1) into v_prev
from quiz.rooms r where r.id = p_room;

update quiz.rooms r
set state = case when state='ended' then 'running' else state end,
    current_q = v_prev
where r.id = p_room;

return query select * from quiz.get_room_progress(p_room);
end
$$;

revoke all on function quiz.prev_question(uuid) from public;
grant execute on function quiz.prev_question(uuid) to authenticated;

-- 종료 (교사용)
create or replace function quiz.end_room(p_room uuid)
returns table (room_id uuid, state text, current_q int, total_q int)
language plpgsql
security definer
set search_path = quiz, public
as $$
begin
update quiz.rooms r
set state = 'ended'
where r.id = p_room;
return query select * from quiz.get_room_progress(p_room);
end
$$;

revoke all on function quiz.end_room(uuid) from public;
grant execute on function quiz.end_room(uuid) to authenticated;
