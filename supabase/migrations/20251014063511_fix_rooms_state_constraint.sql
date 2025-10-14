-- 0) rooms.state 관련 CHECK 제약을 모두 제거 (이름이 무엇이든 전부)
do $$
declare
r record;
begin
for r in
select c.conname
from pg_constraint c
where c.conrelid = 'quiz.rooms'::regclass
      and c.contype = 'c'                     -- CHECK
      and pg_get_constraintdef(c.oid) ilike '%state%'
  loop
    execute format('alter table quiz.rooms drop constraint %I', r.conname);
end loop;
end $$;

-- 1) 컬럼 보강(있으면 패스)
alter table quiz.rooms
    add column if not exists current_q int,
    add column if not exists state text;

-- 2) 데이터 보정 (제약을 다 떼었으므로 안전)
update quiz.rooms
set current_q = 1
where current_q is null or current_q < 1;

update quiz.rooms
set state = 'idle'
where state is null or state not in ('idle','running','ended');

-- 3) 기본값/NOT NULL 부여
alter table quiz.rooms
    alter column current_q set default 1,
alter column current_q set not null,
  alter column state set default 'idle',
  alter column state set not null;

-- 4) 우리가 원하는 CHECK를 NOT VALID로 추가 (데이터 정리 후 검증)
alter table quiz.rooms
    add constraint rooms_state_chk
        check (state in ('idle','running','ended')) not valid;

-- 5) VALIDATE (실데이터 검증)
alter table quiz.rooms validate constraint rooms_state_chk;
