


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE SCHEMA IF NOT EXISTS "quiz";


ALTER SCHEMA "quiz" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "quiz"."_assert_valid_answer"("p_answer" integer) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
begin
  if p_answer < 1 or p_answer > 4 then
    raise exception 'answer_index must be between 1 and 4' using errcode = '22023';
  end if;
  return p_answer;
end$$;


ALTER FUNCTION "quiz"."_assert_valid_answer"("p_answer" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "quiz"."add_question_to_room"("p_room" "uuid", "p_q_index" integer, "p_prompt" "text", "p_choices" "text"[], "p_answer_index" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'quiz', 'public'
    AS $$
declare v_q uuid;
begin
  perform quiz._assert_valid_answer(p_answer_index);
  insert into quiz.questions(prompt, choices, answer_index)
  values (trim(p_prompt), p_choices, p_answer_index)
  returning id into v_q;

  insert into quiz.room_questions(room_id, q_index, question_id)
  values (p_room, p_q_index, v_q);

  return v_q;
end$$;


ALTER FUNCTION "quiz"."add_question_to_room"("p_room" "uuid", "p_q_index" integer, "p_prompt" "text", "p_choices" "text"[], "p_answer_index" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "quiz"."award"("p_student_key" "text", "p_delta" integer, "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'quiz', 'public'
    AS $$
begin
  insert into quiz.tx_log(student_key, delta, reason)
  values (p_student_key, p_delta, coalesce(p_reason, ''));
  insert into quiz.wallets(student_key, stars, updated_at)
  values (p_student_key, greatest(p_delta,0), now())
  on conflict (student_key)
  do update set
    stars = quiz.wallets.stars + excluded.stars,
    updated_at = now();
end
$$;


ALTER FUNCTION "quiz"."award"("p_student_key" "text", "p_delta" integer, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "quiz"."create_room"("p_run" "uuid", "p_minutes" integer) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'quiz', 'public'
    AS $$
declare v_room uuid;
begin
  insert into quiz.rooms(run_id, opens_at, closes_at, state)
  values (p_run, now(), now() + make_interval(mins => greatest(p_minutes,1)), 'open')
  returning id into v_room;
  return v_room;
end$$;


ALTER FUNCTION "quiz"."create_room"("p_run" "uuid", "p_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "quiz"."create_run"("p_title" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'quiz', 'public'
    AS $$
declare v_run uuid;
begin
  insert into quiz.runs(title, state) values (p_title, 'open') returning id into v_run;
  return v_run;
end$$;


ALTER FUNCTION "quiz"."create_run"("p_title" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "quiz"."submissions" (
    "id" bigint NOT NULL,
    "room_id" "uuid" NOT NULL,
    "q_index" integer NOT NULL,
    "student_key" "text" NOT NULL,
    "answer_index" integer NOT NULL,
    "correct" boolean NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "submissions_answer_index_check" CHECK ((("answer_index" >= 1) AND ("answer_index" <= 4))),
    CONSTRAINT "submissions_q_index_check" CHECK (("q_index" >= 1))
);

ALTER TABLE ONLY "quiz"."submissions" REPLICA IDENTITY FULL;


ALTER TABLE "quiz"."submissions" OWNER TO "postgres";


COMMENT ON TABLE "quiz"."submissions" IS '학생 제출 기록(중복 제출 unique 제약)';



COMMENT ON COLUMN "quiz"."submissions"."student_key" IS '클라이언트 생성 식별자(익명)';



CREATE OR REPLACE VIEW "quiz"."v_room_scoreboard" AS
 SELECT "room_id",
    "q_index",
    ("count"(*))::integer AS "total",
    ("sum"(("correct")::integer))::integer AS "correct",
        CASE
            WHEN ("count"(*) = 0) THEN (0)::numeric
            ELSE "round"(((("sum"(("correct")::integer))::numeric / ("count"(*))::numeric) * (100)::numeric), 2)
        END AS "accuracy_pct"
   FROM "quiz"."submissions" "s"
  GROUP BY "room_id", "q_index";


ALTER VIEW "quiz"."v_room_scoreboard" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "quiz"."get_room_scoreboard"("p_room" "uuid") RETURNS SETOF "quiz"."v_room_scoreboard"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'quiz', 'public'
    AS $$
  select *
  from quiz.v_room_scoreboard
  where room_id = p_room
  order by q_index;
$$;


ALTER FUNCTION "quiz"."get_room_scoreboard"("p_room" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "quiz"."get_room_scoreboard"("p_room" "uuid") IS '방별 문항 집계(정답/정답률)';



CREATE OR REPLACE FUNCTION "quiz"."get_room_tally"("p_room" "uuid") RETURNS TABLE("total" integer, "correct" integer)
    LANGUAGE "sql" STABLE
    AS $$
  select count(*)::int as total,
         count(*) filter (where correct)::int as correct
  from quiz.submissions
  where room_id = p_room;
$$;


ALTER FUNCTION "quiz"."get_room_tally"("p_room" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "quiz"."grade_and_store"("p_room" "uuid", "p_q_index" integer, "p_student_key" "text", "p_answer" integer) RETURNS TABLE("correct" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'quiz', 'public'
    AS $$
declare
  v_answer int;
  v_correct boolean;
begin
  -- 유효한 답 체크
  perform quiz._assert_valid_answer(p_answer);

  -- 방/시간 유효성
  if not exists (
    select 1 from quiz.rooms r
    where r.id = p_room
      and r.state = 'open'
      and now() between r.opens_at and r.closes_at
  ) then
    raise exception 'room is not open or time window closed' using errcode = '22023';
  end if;

  -- 정답 조회
  select q.answer_index
    into v_answer
  from quiz.room_questions rq
  join quiz.questions q on q.id = rq.question_id
  where rq.room_id = p_room and rq.q_index = p_q_index;

  if v_answer is null then
    raise exception 'question not found for given room/q_index' using errcode = '22023';
  end if;

  v_correct := (p_answer = v_answer);

  -- 중복 제출 방지: unique 제약이 있으므로 충돌 시 사용자 친화 메시지
  begin
    insert into quiz.submissions(room_id, q_index, student_key, answer_index, correct)
    values (p_room, p_q_index, p_student_key, p_answer, v_correct);
  exception
    when unique_violation then
      raise exception 'duplicate submission: room %, q %, student %', p_room, p_q_index, p_student_key
        using errcode = '23505';
  end;

  return query select v_correct;
end
$$;


ALTER FUNCTION "quiz"."grade_and_store"("p_room" "uuid", "p_q_index" integer, "p_student_key" "text", "p_answer" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "quiz"."grade_and_store"("p_room" "uuid", "p_q_index" integer, "p_student_key" "text", "p_answer" integer) IS '정답 채점 및 제출 저장(방 오픈 시간 내, 중복 제출 금지)';



CREATE TABLE IF NOT EXISTS "quiz"."questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "prompt" "text" NOT NULL,
    "choices" "text"[] NOT NULL,
    "answer_index" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "questions_answer_index_check" CHECK ((("answer_index" >= 1) AND ("answer_index" <= 4))),
    CONSTRAINT "questions_choices_check" CHECK (("array_length"("choices", 1) = 4))
);


ALTER TABLE "quiz"."questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "quiz"."room_questions" (
    "room_id" "uuid" NOT NULL,
    "q_index" integer NOT NULL,
    "question_id" "uuid" NOT NULL,
    CONSTRAINT "room_questions_q_index_check" CHECK (("q_index" >= 1))
);


ALTER TABLE "quiz"."room_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "quiz"."rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "run_id" "uuid" NOT NULL,
    "opens_at" timestamp with time zone NOT NULL,
    "closes_at" timestamp with time zone NOT NULL,
    "state" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rooms_state_check" CHECK (("state" = ANY (ARRAY['open'::"text", 'closed'::"text"])))
);


ALTER TABLE "quiz"."rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "quiz"."runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text",
    "state" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "runs_state_check" CHECK (("state" = ANY (ARRAY['draft'::"text", 'open'::"text", 'closed'::"text"])))
);


ALTER TABLE "quiz"."runs" OWNER TO "postgres";


ALTER TABLE "quiz"."submissions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "quiz"."submissions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "quiz"."tx_log" (
    "id" bigint NOT NULL,
    "student_key" "text" NOT NULL,
    "delta" integer NOT NULL,
    "reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "quiz"."tx_log" OWNER TO "postgres";


ALTER TABLE "quiz"."tx_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "quiz"."tx_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "quiz"."wallets" (
    "student_key" "text" NOT NULL,
    "stars" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wallets_stars_check" CHECK (("stars" >= 0))
);


ALTER TABLE "quiz"."wallets" OWNER TO "postgres";


ALTER TABLE ONLY "quiz"."questions"
    ADD CONSTRAINT "questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "quiz"."room_questions"
    ADD CONSTRAINT "room_questions_pkey" PRIMARY KEY ("room_id", "q_index");



ALTER TABLE ONLY "quiz"."rooms"
    ADD CONSTRAINT "rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "quiz"."runs"
    ADD CONSTRAINT "runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "quiz"."submissions"
    ADD CONSTRAINT "submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "quiz"."submissions"
    ADD CONSTRAINT "submissions_room_id_q_index_student_key_key" UNIQUE ("room_id", "q_index", "student_key");



ALTER TABLE ONLY "quiz"."tx_log"
    ADD CONSTRAINT "tx_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "quiz"."wallets"
    ADD CONSTRAINT "wallets_pkey" PRIMARY KEY ("student_key");



CREATE INDEX "idx_rooms_run" ON "quiz"."rooms" USING "btree" ("run_id");



CREATE INDEX "idx_submissions_room_q" ON "quiz"."submissions" USING "btree" ("room_id", "q_index");



CREATE INDEX "idx_submissions_student" ON "quiz"."submissions" USING "btree" ("student_key");



ALTER TABLE ONLY "quiz"."room_questions"
    ADD CONSTRAINT "room_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "quiz"."questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "quiz"."room_questions"
    ADD CONSTRAINT "room_questions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "quiz"."rooms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "quiz"."rooms"
    ADD CONSTRAINT "rooms_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "quiz"."runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "quiz"."submissions"
    ADD CONSTRAINT "submissions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "quiz"."rooms"("id") ON DELETE CASCADE;



ALTER TABLE "quiz"."questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "quiz"."room_questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "quiz"."rooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "quiz"."runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "quiz"."submissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "submissions_admin_can_select" ON "quiz"."submissions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "submissions_insert_open_room" ON "quiz"."submissions" FOR INSERT TO "authenticated", "anon" WITH CHECK ((EXISTS ( SELECT 1
   FROM "quiz"."rooms" "r"
  WHERE (("r"."id" = "submissions"."room_id") AND ("r"."state" = 'open'::"text") AND (("now"() >= "r"."opens_at") AND ("now"() <= "r"."closes_at"))))));



ALTER TABLE "quiz"."tx_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "quiz"."wallets" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "quiz"."submissions";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT USAGE ON SCHEMA "quiz" TO "anon";
GRANT USAGE ON SCHEMA "quiz" TO "authenticated";

























































































































































GRANT ALL ON FUNCTION "quiz"."add_question_to_room"("p_room" "uuid", "p_q_index" integer, "p_prompt" "text", "p_choices" "text"[], "p_answer_index" integer) TO "authenticated";



GRANT ALL ON FUNCTION "quiz"."award"("p_student_key" "text", "p_delta" integer, "p_reason" "text") TO "authenticated";



GRANT ALL ON FUNCTION "quiz"."create_room"("p_run" "uuid", "p_minutes" integer) TO "authenticated";



GRANT ALL ON FUNCTION "quiz"."create_run"("p_title" "text") TO "authenticated";



GRANT SELECT ON TABLE "quiz"."submissions" TO "authenticated";



GRANT SELECT ON TABLE "quiz"."v_room_scoreboard" TO "anon";
GRANT SELECT ON TABLE "quiz"."v_room_scoreboard" TO "authenticated";



GRANT ALL ON FUNCTION "quiz"."get_room_scoreboard"("p_room" "uuid") TO "anon";
GRANT ALL ON FUNCTION "quiz"."get_room_scoreboard"("p_room" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "quiz"."get_room_tally"("p_room" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "quiz"."grade_and_store"("p_room" "uuid", "p_q_index" integer, "p_student_key" "text", "p_answer" integer) TO "anon";
GRANT ALL ON FUNCTION "quiz"."grade_and_store"("p_room" "uuid", "p_q_index" integer, "p_student_key" "text", "p_answer" integer) TO "authenticated";
























ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































RESET ALL;

