-- create_room이 state를 허용값으로 넣도록 재정의 ('idle'로 시작)
create or replace function quiz.create_room(p_run uuid, p_minutes int default 60)
returns uuid
language plpgsql
security definer
set search_path = quiz, public
as $$
declare
v_room uuid;
  v_now  timestamptz := now();
begin
insert into quiz.rooms (id, run_id, opens_at, closes_at, state, current_q)
values (
           gen_random_uuid(),
           p_run,
           v_now,
           v_now + make_interval(mins => p_minutes),
           'idle',     -- ✅ 체크 제약과 일치
           1           -- 진행 제어 컬럼 초기화
       )
    returning id into v_room;

return v_room;
end
$$;

revoke all on function quiz.create_room(uuid, int) from public;
grant execute on function quiz.create_room(uuid, int) to authenticated;
