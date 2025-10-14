-- 학생: 방의 p_q번째 문항 조회(보기만). 정렬 = q_index
create or replace function quiz.get_room_question(p_room uuid, p_q int default 1)
returns table (
  q int,               -- 1-based 번호
  total int,           -- 총 문항 수
  room_id uuid,
  q_index int,         -- 방 내 문항 인덱스(정렬 기준)
  question_id uuid,
  stem text,           -- 문제 본문
  choices jsonb        -- [{key:'A', text:'...'}, ...]
)
language sql
security definer
set search_path = quiz, public
as $$
with ordered as (
  select
    rq.room_id,
    rq.q_index,
    rq.question_id,
    row_number() over (order by rq.q_index) as q,
    count(*) over (partition by rq.room_id) as total
  from quiz.room_questions rq
  where rq.room_id = p_room
)
select
    o.q,
    o.total,
    o.room_id,
    o.q_index,
    o.question_id,
    qs.prompt as stem,
    (
        -- text[] → [{key:'A'.., text:'...'}] 변환 (ord는 bigint → int 캐스팅)
        select jsonb_agg(
                       jsonb_build_object('key', chr(64 + ord::int), 'text', ch)
                           order by ord
               )
        from unnest(qs.choices) with ordinality as t(ch, ord)
    ) as choices
from ordered o
         join quiz.questions qs on qs.id = o.question_id
where o.q = greatest(1, least(p_q, o.total));
$$;

revoke all on function quiz.get_room_question(uuid, int) from public;
grant execute on function quiz.get_room_question(uuid, int) to anon, authenticated;

-- 'A'|'B'|'C'|'D' → 1..4 매핑 래퍼
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
declare v_idx int;
begin
  v_idx := case upper(trim(p_answer_key))
    when 'A' then 1 when 'B' then 2 when 'C' then 3 when 'D' then 4
    else null end;
  if v_idx is null then
    raise exception 'invalid answer key: % (expected A-D)', p_answer_key using errcode = '22023';
end if;

return query
select * from quiz.grade_and_store(p_room, p_q_index, p_student_key, v_idx);
end
$$;

revoke all on function quiz.grade_and_store_by_key(uuid, int, text, text) from public;
grant execute on function quiz.grade_and_store_by_key(uuid, int, text, text) to anon, authenticated;

