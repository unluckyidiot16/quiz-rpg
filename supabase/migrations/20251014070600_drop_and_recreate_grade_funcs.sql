-- 0) 기존 grade_* 루틴 전부 드롭(오버로드/의존 포함)
do $$
declare
r record;
begin
for r in
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'quiz'
  and p.proname in ('grade_and_store', 'grade_and_store_by_key')
    loop
    execute format('drop routine %I.%I(%s) cascade;', r.nspname, r.proname, r.args);
end loop;
end
$$;

-- 1) 채점 본체: state='ended'만 금지, 시간창이 설정되어 있으면 범위 체크
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
values (p_room, p_q_index, p_student_key, p_answer_index, (p_answer_index = v_answer_ix));

-- 결과 반환
return query select (p_answer_index = v_answer_ix) as correct;
end
$$;

revoke all on function quiz.grade_and_store(uuid, int, text, int) from public;
grant execute on function quiz.grade_and_store(uuid, int, text, int) to anon, authenticated;

-- 2) 키 래퍼: 'A'..'D' → 1..4
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

return query select * from quiz.grade_and_store(p_room, p_q_index, p_student_key, v_ix);
end
$$;

revoke all on function quiz.grade_and_store_by_key(uuid, int, text, text) from public;
grant execute on function quiz.grade_and_store_by_key(uuid, int, text, text) to anon, authenticated;
