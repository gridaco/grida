alter type "public"."doctype" rename to "doctype__old_version_to_be_dropped";

create type "public"."doctype" as enum ('v0_form', 'v0_site', 'v0_schema', 'v0_canvas', 'v0_bucket');

alter table "public"."document" alter column doctype type "public"."doctype" using doctype::text::"public"."doctype";

drop type "public"."doctype__old_version_to_be_dropped";


