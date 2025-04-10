-- seed struct
INSERT INTO _grida.sys_json_schema (id, schema)
VALUES (
    'favicon',
    '{
      "type": "object",
      "required": ["src"],
      "properties": {
        "src": { "type": "string", "minLength": 1 },
        "srcDark": { "type": "string", "minLength": 1 }
      },
      "additionalProperties": false
    }'::jsonb
);
