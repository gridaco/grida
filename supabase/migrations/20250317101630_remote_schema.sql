create table "public"."customer_auth_policy" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "project_id" bigint not null,
    "challenges" jsonb[] not null,
    "description" text,
    "name" text not null,
    "enabled" boolean not null default true,
    "scopes" text[] not null
);


set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.jsonb_array_objects_only(arr jsonb[])
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  elem jsonb;
BEGIN
  IF array_length(arr, 1) IS NULL OR array_length(arr, 1) = 0 THEN
    RETURN FALSE;
  END IF;

  FOREACH elem IN ARRAY arr LOOP
    IF jsonb_typeof(elem) <> 'object' THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$function$
;

alter table "public"."customer_auth_policy" enable row level security;

CREATE UNIQUE INDEX customer_auth_policy_pkey ON public.customer_auth_policy USING btree (id);

alter table "public"."customer_auth_policy" add constraint "customer_auth_policy_pkey" PRIMARY KEY using index "customer_auth_policy_pkey";

alter table "public"."customer_auth_policy" add constraint "customer_auth_policy_challenges_check" CHECK (jsonb_array_objects_only(challenges)) not valid;

alter table "public"."customer_auth_policy" validate constraint "customer_auth_policy_challenges_check";

alter table "public"."customer_auth_policy" add constraint "customer_auth_policy_project_id_fkey" FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE not valid;

alter table "public"."customer_auth_policy" validate constraint "customer_auth_policy_project_id_fkey";

alter table "public"."customer_auth_policy" add constraint "customer_auth_policy_scopes_check" CHECK ((array_length(scopes, 1) > 0)) not valid;

alter table "public"."customer_auth_policy" validate constraint "customer_auth_policy_scopes_check";

grant delete on table "public"."customer_auth_policy" to "anon";

grant insert on table "public"."customer_auth_policy" to "anon";

grant references on table "public"."customer_auth_policy" to "anon";

grant select on table "public"."customer_auth_policy" to "anon";

grant trigger on table "public"."customer_auth_policy" to "anon";

grant truncate on table "public"."customer_auth_policy" to "anon";

grant update on table "public"."customer_auth_policy" to "anon";

grant delete on table "public"."customer_auth_policy" to "authenticated";

grant insert on table "public"."customer_auth_policy" to "authenticated";

grant references on table "public"."customer_auth_policy" to "authenticated";

grant select on table "public"."customer_auth_policy" to "authenticated";

grant trigger on table "public"."customer_auth_policy" to "authenticated";

grant truncate on table "public"."customer_auth_policy" to "authenticated";

grant update on table "public"."customer_auth_policy" to "authenticated";

grant delete on table "public"."customer_auth_policy" to "service_role";

grant insert on table "public"."customer_auth_policy" to "service_role";

grant references on table "public"."customer_auth_policy" to "service_role";

grant select on table "public"."customer_auth_policy" to "service_role";

grant trigger on table "public"."customer_auth_policy" to "service_role";

grant truncate on table "public"."customer_auth_policy" to "service_role";

grant update on table "public"."customer_auth_policy" to "service_role";


