alter table "grida_canvas"."canvas_document" add column "__schema_version" text not null default '0.0.1-beta.1+20250303'::text;

CREATE UNIQUE INDEX canvas_document_pkey ON grida_canvas.canvas_document USING btree (id);

alter table "grida_canvas"."canvas_document" add constraint "canvas_document_pkey" PRIMARY KEY using index "canvas_document_pkey";


