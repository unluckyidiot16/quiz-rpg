-- 0) 같은 이름의 모든 함수/오버로드를 제거
do $$
declare
r record;
begin
for r in
select format('drop routine %I.%I(%s) cascade;', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as ddl
from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'get_room_scoreboard'
    loop
    execute r.ddl;
end loop;
end
$$;

-- 1) 새 정의 (submissions에는 question_id/solved_ms 없음 → q_index로 집계, avg_ms는 null)
create or replace function quiz.get_room_scoreboard(p_room uuid)
returns table (
  room_id uuid,
  total_q int,
  student_rows jsonb,
  per_question jsonb
)
language sql
security definer
set search_path = quiz, public
as $$
with rq as (
  select room_id, q_index, question_id
  from quiz.room_questions
  where room_id = p_room
),
total_q as (
  select count(*)::int as total_q from rq
),
stu as (
  select s.student_key as submitter,
         count(*)::int as answered,
         sum(case when s.correct then 1 else 0 end)::int as correct,
         null::int as avg_ms                      -- 시간 데이터 없음 → null
  from quiz.submissions s
  join rq on rq.room_id = s.room_id and rq.q_index = s.q_index
  group by s.student_key
),
student_rows_json as (
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'submitter', submitter,
               'answered', answered,
               'correct', correct,
               'rate', case when tq.total_q > 0
                            then round((correct::numeric / tq.total_q) * 100, 1)
                            else 0 end,
               'avg_ms', avg_ms
             )
             order by correct desc, avg_ms nulls last
           ),
           '[]'::jsonb
         ) as student_rows
  from stu cross join total_q tq
),
pq as (
  select rq.q_index,
         rq.question_id,
         q.prompt as stem,
         count(s.*)::int as attempts,
         sum(case when s.correct then 1 else 0 end)::int as correct,
         null::int as avg_ms                      -- 시간 데이터 없음 → null
  from rq
  join quiz.questions q on q.id = rq.question_id
  left join quiz.submissions s
         on s.room_id = rq.room_id and s.q_index = rq.q_index
  group by rq.q_index, rq.question_id, q.prompt
),
per_question_json as (
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'q_index', q_index,
               'stem', stem,
               'attempts', attempts,
               'correct', correct,
               'correct_rate', case when attempts > 0
                                     then round((correct::numeric/attempts)*100, 1)
                                     else null end,
               'avg_ms', avg_ms,
               'question_id', question_id
             )
             order by q_index
           ),
           '[]'::jsonb
         ) as per_question
  from pq
)
select
    p_room as room_id,
    (select total_q from total_q),
    (select student_rows from student_rows_json),
    (select per_question from per_question_json);
$$;

-- 2) 권한
revoke all on function quiz.get_room_scoreboard(uuid) from public;
grant execute on function quiz.get_room_scoreboard(uuid) to anon, authenticated;
