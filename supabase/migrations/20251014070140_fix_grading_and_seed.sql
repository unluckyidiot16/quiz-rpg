-- supabase/migrations/<timestamp>_fix_grading_and_seed.sql

-- 0) 기존 채점 함수들(있으면) 제거
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='quiz'
      and p.proname='grade_and_store'
      and pg_get_function_identity_arguments(p.oid)='uuid, integer, text, integer'
  ) then
drop function quiz.grade_and_store(uuid, int, text, int);
end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='quiz'
      and p.proname='grade_and_store_by_key'
      and pg_get_function_identity_arguments(p.oid)='uuid, integer, text, text'
  ) then
drop function quiz.grade_and_store_by_key(uuid, int, text, text);
end if;
end $$;

-- 1) 채점 본체: state 규칙 = 'ended'만 금지, 시간창은 있으면 체크
create or replace function quiz.grade_and_store(
  p_room uuid,
  p_q_index int,
  p_student_key text,
  p_answer int          -- ← 이름을 기존과 동일하게 유지
)
returns table (correct boolean)
language plpgsql
security definer
set search_path = quiz, public
as $$
declare
v_now       timestamptz := now();
  v_state     text;
  v_open_ok   boolean;
  v_answer_ix int;
begin
  -- 방 상태/시간창 확인
select r.state,
       (r.opens_at is null or r.closes_at is null or (v_now between r.opens_at and r.closes_at)) as open_ok
into v_state, v_open_ok
from quiz.rooms r
where r.id = p_room;

if v_state is null then
    raise exception 'room % not found', p_room using errcode='22023';
end if;

  -- 종료된 방만 차단( idle/running 은 허용 ), 시간창이 있으면 반드시 통과해야 함
  if v_state = 'ended' or not coalesce(v_open_ok, true) then
    raise exception 'room is not open or time window closed' using errcode='22023';
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
values (p_room, p_q_index, p_student_key, p_answer, (p_answer = v_answer_ix));

-- 결과 반환
return query
select (p_answer = v_answer_ix) as correct;
end
$$;

revoke all on function quiz.grade_and_store(uuid, int, text, int) from public;
grant execute on function quiz.grade_and_store(uuid, int, text, int) to anon, authenticated;


-- 2) 키 래퍼: 'A'..'D' → 1..4 매핑
create or replace function quiz.grade_and_store_by_key(
  p_room uuid,
  p_q_index int,
  p_student_key text,
  p_answer_key text
)
returns table (correct boolean)
language plpgsql
security definer
set search_path = quiz, public
as $$
declare
v_ix int;
begin
  v_ix := case upper(coalesce(p_answer_key, ''))
            when 'A' then 1
            when 'B' then 2
            when 'C' then 3
            when 'D' then 4
            else null
end;
  if v_ix is null then
    raise exception 'invalid answer key: %', p_answer_key using errcode='22023';
end if;

return query
select * from quiz.grade_and_store(p_room, p_q_index, p_student_key, v_ix);
end
$$;

revoke all on function quiz.grade_and_store_by_key(uuid, int, text, text) from public;
grant execute on function quiz.grade_and_store_by_key(uuid, int, text, text) to anon, authenticated;

-- 3) 5문항 샘플 시드 RPC(중복 방지)
create or replace function quiz.seed_demo_questions(p_room uuid)
returns void
language plpgsql
security definer
set search_path = quiz, public
as $$
begin
  -- 1
  if not exists (select 1 from quiz.room_questions where room_id=p_room and q_index=1) then
    perform quiz.add_question_to_room(p_room, 1, '2 + 2 = ?', ARRAY['3','4','5','6'], 2);
end if;
  -- 2
  if not exists (select 1 from quiz.room_questions where room_id=p_room and q_index=2) then
    perform quiz.add_question_to_room(p_room, 2, '대한민국 수도는?', ARRAY['서울','부산','대구','인천'], 1);
end if;
  -- 3
  if not exists (select 1 from quiz.room_questions where room_id=p_room and q_index=3) then
    perform quiz.add_question_to_room(p_room, 3, '바다의 색은?', ARRAY['빨강','파랑','보라','노랑'], 2);
end if;
  -- 4
  if not exists (select 1 from quiz.room_questions where room_id=p_room and q_index=4) then
    perform quiz.add_question_to_room(p_room, 4, '5 × 3 = ?', ARRAY['8','12','15','18'], 3);
end if;
  -- 5
  if not exists (select 1 from quiz.room_questions where room_id=p_room and q_index=5) then
    perform quiz.add_question_to_room(p_room, 5, '봄 다음 계절은?', ARRAY['여름','가을','겨울','봄'], 1);
end if;
end
$$;

revoke all on function quiz.seed_demo_questions(uuid) from public;
grant execute on function quiz.seed_demo_questions(uuid) to authenticated;
