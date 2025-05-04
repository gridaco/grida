-- generated from supabase ui - enable supabase queue via ui.

create schema if not exists "pgmq";

create extension if not exists "pgmq" with schema "pgmq" version '1.4.4';

grant select on table "pgmq"."meta" to "pg_monitor";
grant delete on table "pgmq"."meta" to "service_role";
grant insert on table "pgmq"."meta" to "service_role";
grant references on table "pgmq"."meta" to "service_role";
grant select on table "pgmq"."meta" to "service_role";
grant trigger on table "pgmq"."meta" to "service_role";
grant truncate on table "pgmq"."meta" to "service_role";
grant update on table "pgmq"."meta" to "service_role";