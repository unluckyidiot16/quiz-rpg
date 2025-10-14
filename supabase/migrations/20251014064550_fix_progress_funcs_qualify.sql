-- start_room
create or replace function quiz.start_room(p_room uuid)
returns table (room_id uuid, state text, current_q int, total_q int)
language plpgsql
security definer
set search_path = quiz, public
as $$
declare
v_total int;
begin
select count(*)::int
into v_total
from quiz.room_questions rq
where rq.room_id = p_room;

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

-- next_question
create or replace function quiz.next_question(p_room uuid)
returns table (room_id uuid, state text, current_q int, total_q int)
language plpgsql
security definer
set search_path = quiz, public
as $$
declare
v_total int;
  v_next  int;
begin
select count(*)::int
into v_total
from quiz.room_questions rq
where rq.room_id = p_room;

if v_total = 0 then
    raise exception 'room % has no questions', p_room using errcode='22023';
end if;

select least(r.current_q + 1, v_total)
into v_next
from quiz.rooms r
where r.id = p_room;

update quiz.rooms r
set state     = case when r.state = 'ended' then 'running' else r.state end,
    current_q = v_next
where r.id = p_room;

return query select * from quiz.get_room_progress(p_room);
end
$$;

revoke all on function quiz.next_question(uuid) from public;
grant execute on function quiz.next_question(uuid) to authenticated;

-- prev_question
create or replace function quiz.prev_question(p_room uuid)
returns table (room_id uuid, state text, current_q int, total_q int)
language plpgsql
security definer
set search_path = quiz, public
as $$
declare
v_prev int;
begin
select greatest(r.current_q - 1, 1)
into v_prev
from quiz.rooms r
where r.id = p_room;

update quiz.rooms r
set state     = case when r.state = 'ended' then 'running' else r.state end,
    current_q = v_prev
where r.id = p_room;

return query select * from quiz.get_room_progress(p_room);
end
$$;

revoke all on function quiz.prev_question(uuid) from public;
grant execute on function quiz.prev_question(uuid) to authenticated;
