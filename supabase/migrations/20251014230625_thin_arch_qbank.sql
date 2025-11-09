-- 전역 버전 싱글톤
create table if not exists qbank_version (
                                             id int primary key default 1 check (id=1),
    current_version int not null default 0
    );
insert into qbank_version(id) values (1)
    on conflict (id) do nothing;

-- 문항 테이블(핵심 필드만 예시)
create table if not exists question_bank (
                                             id uuid primary key default gen_random_uuid(),  -- ← 여기 변경
    subject_id text,
    unit_id text,
    grade int,
    difficulty int,
    stem text,
    choices jsonb,              -- [{key:'A', text:'…'}, …]
    answer text,                -- 'A' 등
    tags text[],
    explanation text,
    updated_at timestamptz not null default now(),
    deleted_at timestamptz,
    row_version int not null default 0
    );

-- 전역 버전 증가
create or replace function qbank_next_version()
returns int language plpgsql security definer as $$
declare v int;
begin
update qbank_version set current_version = current_version + 1 where id=1
    returning current_version into v;
return v;
end$$;

-- 삽입/수정 시 행 버전 부여
create or replace function qbank_set_row_version()
returns trigger language plpgsql as $$
begin
  new.row_version := qbank_next_version();
  new.updated_at := now();
return new;
end$$;

drop trigger if exists trg_qbank_iud on question_bank;
create trigger trg_qbank_iud
    before insert or update on question_bank
                         for each row execute function qbank_set_row_version();

-- 소프트 삭제
create or replace function qbank_soft_delete(_id uuid)
returns void language plpgsql security definer as $$
begin
update question_bank
set deleted_at = now(),
    row_version = qbank_next_version()
where id = _id;
end$$;

-- 매니페스트: 버전/총량/해시
create or replace function get_question_manifest()
returns table(version int, total int, hash text, lastupdated timestamptz)
language sql stable as $$
  with m as (
    select current_version as v from qbank_version where id=1
  ),
  s as (
    select count(*)::int as total,
           max(updated_at) as lu,
           md5(string_agg(
                id::text || '|' || row_version::text || '|' ||
                coalesce(updated_at::text,'') || '|' ||
                coalesce(deleted_at::text,''),
                ','
               order by id
           )) as h
    from question_bank
  )
select m.v, s.total, s.h, s.lu from m, s;
$$;

-- 델타: since_version 이후 변경된 upsert/deletes
create or replace function get_questions_delta(since_version int)
returns json language plpgsql stable as $$
declare
new_version int;
  j json;
begin
select current_version into new_version from qbank_version where id=1;

with changed as (
    select *
    from question_bank
    where row_version > since_version
),
     upserts as (
         select jsonb_build_object(
                        'id', id,
                        'subject_id', subject_id,
                        'unit_id', unit_id,
                        'grade', grade,
                        'difficulty', difficulty,
                        'stem', stem,
                        'choices', choices,
                        'answer', answer,
                        'tags', to_jsonb(tags),
                        'explanation', explanation,
                        'updated_at', updated_at
                ) as j
         from changed
         where deleted_at is null
     ),
     deletes as (
         select id from changed where deleted_at is not null
     ),
     man as (
         select (select hash from get_question_manifest()) as hash
     )
select json_build_object(
               'upserts', coalesce(json_agg(u.j),'[]'::json),
               'deletes', (select coalesce(json_agg(d.id),'[]'::json) from deletes d),
               'new_version', new_version,
               'hash', (select hash from man)
       )
into j
from upserts u;

return j;
end$$;
