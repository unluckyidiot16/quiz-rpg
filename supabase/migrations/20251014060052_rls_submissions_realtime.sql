-- quiz.submissions: Realtime용 설정 (RLS + SELECT 정책 + publication)

-- Realtime은 SELECT 정책을 따르므로, anon/authenticated가 읽을 수 있어야 이벤트가 전달됩니다.
alter table quiz.submissions enable row level security;

do $$
begin
  -- 정책이 없을 때만 생성
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'quiz'
      and tablename  = 'submissions'
      and policyname = 'realtime_scoreboard_select'
  ) then
    create policy realtime_scoreboard_select
      on quiz.submissions
      for select
                              to anon, authenticated
                              using (true);
end if;
end
$$;

-- Realtime publication에 테이블 추가 (이미 추가되어 있으면 무시)
do $$
begin
begin
    alter publication supabase_realtime add table quiz.submissions;
exception
    when duplicate_object then null;
end;
end
$$;
