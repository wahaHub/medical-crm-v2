-- The video staging API uses a direct PostgreSQL connection. Supabase REST and
-- GraphQL roles must never reach identity or interpretation authority tables,
-- even on projects that retain legacy public-schema default grants.

DO $$
DECLARE
  table_name text;
  target_schema text := current_schema();
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users',
    'video_consultations',
    'video_consultation_hosted_deployments',
    'video_consultation_ai_consents',
    'video_consultation_interpretation_jobs',
    'video_consultation_interpretation_events',
    'video_consultation_source_tracks',
    'video_consultation_provider_sessions',
    'video_interpretation_release_approvals',
    'video_consultation_interpretation_allowlist',
    'video_interpretation_self_hosts',
    'video_interpretation_reconcile_leases',
    'video_interpretation_schema_migrations'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      target_schema,
      table_name
    );
  END LOOP;
END $$;

DO $$
DECLARE
  role_name text;
  target_schema text := current_schema();
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF to_regrole(role_name) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM %I',
        target_schema,
        role_name
      );
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM %I',
        target_schema,
        role_name
      );
      EXECUTE format(
        'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA %I FROM %I',
        target_schema,
        role_name
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL PRIVILEGES ON TABLES FROM %I',
        target_schema,
        role_name
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
        target_schema,
        role_name
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE EXECUTE ON FUNCTIONS FROM %I',
        target_schema,
        role_name
      );
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  target_schema text := current_schema();
BEGIN
  EXECUTE format(
    'REVOKE EXECUTE ON FUNCTION %I.invalidate_video_interpretation_on_consultation_close() FROM PUBLIC',
    target_schema
  );
  EXECUTE format(
    'REVOKE EXECUTE ON FUNCTION %I.invalidate_video_interpretation_on_deployment_change() FROM PUBLIC',
    target_schema
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',
    target_schema
  );
END $$;

-- Fail the bootstrap if any Supabase Data API role still inherits authority on
-- a protected table or trigger function.
DO $$
DECLARE
  role_name text;
  table_name text;
  function_name text;
  sequence_name text;
  target_schema text := current_schema();
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF to_regrole(role_name) IS NULL THEN
      CONTINUE;
    END IF;

    FOREACH table_name IN ARRAY ARRAY[
      'users',
      'video_consultations',
      'video_consultation_hosted_deployments',
      'video_consultation_ai_consents',
      'video_consultation_interpretation_jobs',
      'video_consultation_interpretation_events',
      'video_consultation_source_tracks',
      'video_consultation_provider_sessions',
      'video_interpretation_release_approvals',
      'video_consultation_interpretation_allowlist',
      'video_interpretation_self_hosts',
      'video_interpretation_reconcile_leases',
      'video_interpretation_schema_migrations'
    ]
    LOOP
      IF has_table_privilege(
        role_name,
        format('%I.%I', target_schema, table_name),
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      ) THEN
        RAISE EXCEPTION 'Data API role % retains privileges on %.%',
          role_name, target_schema, table_name;
      END IF;
    END LOOP;

    FOR sequence_name IN
      SELECT c.relname
      FROM pg_class AS c
      JOIN pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = target_schema AND c.relkind = 'S'
    LOOP
      IF has_sequence_privilege(
        role_name,
        format('%I.%I', target_schema, sequence_name),
        'USAGE,SELECT,UPDATE'
      ) THEN
        RAISE EXCEPTION 'Data API role % retains privileges on sequence %.%',
          role_name, target_schema, sequence_name;
      END IF;
    END LOOP;

    FOREACH function_name IN ARRAY ARRAY[
      format('%I.invalidate_video_interpretation_on_consultation_close()', target_schema),
      format('%I.invalidate_video_interpretation_on_deployment_change()', target_schema)
    ]
    LOOP
      IF has_function_privilege(role_name, function_name, 'EXECUTE') THEN
        RAISE EXCEPTION 'Data API role % retains execute on %',
          role_name, function_name;
      END IF;
    END LOOP;
  END LOOP;
END $$;
