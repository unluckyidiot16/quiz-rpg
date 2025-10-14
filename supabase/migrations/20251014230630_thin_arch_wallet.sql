-- 서버 비밀 보관(서비스 롤만 접근하도록)
create table if not exists server_secrets (
                                              key text primary key,
                                              value text not null
);

-- 유저 지갑
create table if not exists users_wallet (
                                            user_id uuid primary key,
                                            stars int not null default 0,
                                            coins int not null default 0,
                                            nonce bigint not null default 0,
                                            sig text
);

alter table users_wallet enable row level security;
create policy pw_select_self on users_wallet
for select using (auth.uid() = user_id);

-- HMAC 서명 계산
create or replace function compute_wallet_sig(_user uuid)
returns text language plpgsql security definer as $$
declare s text; payload text; k text;
begin
select value into k from server_secrets where key = 'wallet_hmac_key';
if k is null then
    raise exception 'wallet_hmac_key not set';
end if;

select (_user::text || ':' || stars || ':' || coins || ':' || nonce)
into payload
from users_wallet where user_id = _user;

select encode(hmac(payload::bytea, k::bytea, 'sha256'),'hex') into s;
return s;
end$$;

-- 최초 지갑 보장
create or replace function ensure_wallet()
returns table(walletsig text) language plpgsql security definer as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;

insert into users_wallet(user_id, stars, coins, nonce)
values (uid, 0, 0, 1)
    on conflict (user_id) do nothing;

update users_wallet
set sig = compute_wallet_sig(uid)
where user_id = uid;

return query select sig from users_wallet where user_id = uid;
end$$;

-- 델타 커밋(허용 이유만 처리)
create or replace function commit_wallet(_stars int, _coins int, _reason text, _prevsig text)
returns table(stars int, coins int, walletsig text)
language plpgsql security definer as $$
declare uid uuid := auth.uid();
        k text;
        ok boolean := false;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  -- 이전 서명 검증
  if (select sig from users_wallet where user_id=uid) != _prevsig then
    raise exception 'invalid previous signature';
end if;

  -- 허용 사유 화이트리스트
  if _reason in ('enter_dungeon','clear_dungeon','gacha_pull','grant','revoke') then
    ok := true;
end if;
  if not ok then
    raise exception 'reason not allowed: %', _reason;
end if;

update users_wallet
set stars = stars + _stars,
    coins = coins + _coins,
    nonce = nonce + 1
where user_id = uid;

update users_wallet
set sig = compute_wallet_sig(uid)
where user_id = uid;

return query
select stars, coins, sig from users_wallet where user_id = uid;
end$$;
