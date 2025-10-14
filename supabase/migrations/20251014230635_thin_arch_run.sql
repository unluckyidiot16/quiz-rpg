create table if not exists rooms (
                                     id uuid primary key default gen_random_uuid(),  -- ← 여기 변경
    open_at timestamptz not null,
    close_at timestamptz not null,
    cost_stars int not null default 0,
    cost_coins int not null default 0
    );

create table if not exists run_tickets (
                                           ticket text primary key,
                                           user_id uuid not null,
                                           room_id uuid not null,
                                           created_at timestamptz not null default now(),
    used_at timestamptz
    );

-- 입장(요금 차감 + 티켓 발급)
create or replace function begin_run(_room uuid)
returns table(ticket text, walletsig text, servernow timestamptz, roomopen timestamptz, roomclose timestamptz)
language plpgsql security definer as $$
declare uid uuid := auth.uid();
        r record;
        sig text;
begin
  if uid is null then raise exception 'not authenticated'; end if;

select * into r from rooms where id = _room;
if r is null then raise exception 'room not found'; end if;

  -- 입장비 차감
  perform *
  from commit_wallet(-r.cost_stars, -r.cost_coins, 'enter_dungeon',
                     (select sig from users_wallet where user_id=uid));

  -- 티켓 발급
  ticket := encode(digest(uid::text || ':' || _room::text || ':' || now()::text, 'sha256'),'hex');
insert into run_tickets(ticket, user_id, room_id) values (ticket, uid, _room);

select sig into walletsig from users_wallet where user_id = uid;
servernow := now(); roomopen := r.open_at; roomclose := r.close_at;
  return;
end$$;

-- 채점(간단 버전: 서버에서 정오 판정 + 증빙 토큰 발급)
-- answers: [{"question_id":"…","choiceKey":"A","timeMs":1234}, ...]
create or replace function submit_room(_room uuid, answers jsonb)
returns table(correct int, total int, proof text)
language plpgsql security definer as $$
declare uid uuid := auth.uid();
        cnt int; tot int;
        secret text;
begin
  if uid is null then raise exception 'not authenticated'; end if;

select count(*) into tot from jsonb_array_elements(answers);
select count(*) into cnt
from jsonb_to_recordset(answers) as a(question_id uuid, choiceKey text)
         join question_bank q on q.id = a.question_id
where q.deleted_at is null and q.answer = a.choiceKey;

select value into secret from server_secrets where key='run_hmac_key';
proof := encode(hmac((uid::text||':'||_room::text||':'||cnt::text||'/'||tot::text)::bytea,
                       secret::bytea, 'sha256'),'hex');
  correct := cnt; total := tot;
  return;
end$$;

-- 런 종료(보상 지급)
create or replace function commit_run(_ticket text, _room uuid, _proof text)
returns table(stars int, coins int, walletsig text)
language plpgsql security definer as $$
declare uid uuid := auth.uid();
        secret text; ok boolean;
        reward_stars int := 0; reward_coins int := 0;
        prevsig text;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  -- 티켓 유효성
  if not exists(select 1 from run_tickets where ticket=_ticket and user_id=uid and room_id=_room and used_at is null)
  then raise exception 'invalid or used ticket'; end if;

  -- 증빙 검증(여기서는 형식만 확인; 실제로는 서버쪽에 점수 저장해 두고 비교하는 방식 권장)
select value into secret from server_secrets where key='run_hmac_key';
-- TODO: 실제 점수에 근거한 재계산/검증 로직 추가

-- 임시: 고정 보상(스텁)
reward_stars := 1; reward_coins := 5;

select sig into prevsig from users_wallet where user_id=uid;

return query
select w.stars, w.coins, w.sig
from commit_wallet(reward_stars, reward_coins, 'clear_dungeon', prevsig) as w(stars int, coins int, walletsig text);

update run_tickets set used_at = now() where ticket=_ticket;
end$$;
