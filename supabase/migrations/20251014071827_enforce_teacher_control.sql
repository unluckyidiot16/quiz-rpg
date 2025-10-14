-- 1) 다음 문항: 항상 running으로 전환 (ended든 idle이든)
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
select count(*)::int into v_total
from quiz.room_questions rq
where rq.room_id = p_room;

if v_total = 0 then
    raise exception 'room % has no questions', p_room using errcode='22023';
end if;

select least(r.current_q + 1, v_total) into v_next
from quiz.rooms r where r.id = p_room;

update quiz.rooms r
set state     = 'running',
    current_q = v_next
where r.id = p_room;

return query select * from quiz.get_room_progress(p_room);
end
$$;

revoke all on function quiz.next_question(uuid) from public;
grant execute on function quiz.next_question(uuid) to authenticated;

-- 2) 이전 문항: 항상 running으로 전환
create or replace function quiz.prev_question(p_room uuid)
returns table (room_id uuid, state text, current_q int, total_q int)
language plpgsql
security definer
set search_path = quiz, public
as $$
declare
v_prev int;
begin
select greatest(r.current_q - 1, 1) into v_prev
from quiz.rooms r where r.id = p_room;

update quiz.rooms r
set state     = 'running',
    current_q = v_prev
where r.id = p_room;

return query select * from quiz.get_room_progress(p_room);
end
$$;

revoke all on function quiz.prev_question(uuid) from public;
grant execute on function quiz.prev_question(uuid) to authenticated;

-- 3) 채점 규칙: 방이 'running' 상태이고, p_q_index가 현재 문항과 동일할 때만 허용
-- ⚠️ 파라미터 이름은 기존과 동일하게 'p_answer_index' 유지(42P13 회피)
create or replace function quiz.grade_and_store(
  p_room uuid,
  p_q_index int,
  p_student_key text,
  p_answer_index int
)
returns table (correct boolean)
language plpgsql
security definer
set search_path = quiz, public
as $$
declare
v_now       timestamptz := now();
  v_state     text;
  v_current   int;
  v_open_ok   boolean;
  v_answer_ix int;
begin
  -- 진행/시간창 조회
select r.state,
       r.current_q,
       (r.opens_at is null or r.closes_at is null or (v_now between r.opens_at and r.closes_at))
into v_state, v_current, v_open_ok
from quiz.rooms r
where r.id = p_room;

if v_state is null then
    raise exception 'room % not found', p_room using errcode='22023';
end if;

  -- 오직 running만 허용
  if v_state <> 'running' then
    raise exception 'room is not running' using errcode='22023';
end if;

  -- 시간창 설정 시 반드시 범위 내
  if not coalesce(v_open_ok, true) then
    raise exception 'room time window closed' using errcode='22023';
end if;

  -- 현재 문항과 일치할 때만 제출 허용
  if p_q_index <> v_current then
    raise exception 'question % is not the current question %', p_q_index, v_current using errcode='22023';
end if;

  -- 정답 인덱스 조회
select q.answer_index
into v_answer_ix
from quiz.room_questions rq
         join quiz.questions q on q.id = rq.question_id
where rq.room_id = p_room
  and rq.q_index = p_q_index;

if v_answer_ix is null then
    raise exception 'question (room %, q_index %) not found', p_room, p_q_index using errcode='22023';
end if;

  -- 제출 저장
insert into quiz.submissions (room_id, q_index, student_key, answer_index, correct)
values (p_room, p_q_index, p_student_key, p_answer_index, (p_answer_index = v_answer_ix));

-- 결과 반환
return query select (p_answer_index = v_answer_ix) as correct;
end
$$;

revoke all on function quiz.grade_and_store(uuid, int, text, int) from public;
grant execute on function quiz.grade_and_store(uuid, int, text, int) to anon, authenticated;

