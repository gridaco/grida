/*
 * Grida Hosted (SaaS/Cloud) Event & Job Management Schema
 * ------------------------------------------------------
 * 
 * This schema manages events and jobs for the hosted version of Grida.
 * It provides a queue-based system for handling various automated tasks
 * such as welcome emails, marketing communications, and other background jobs.
 * 
 * The actual job processing is handled by isolated worker servers that
 * consume from these queues, ensuring scalability and separation of concerns.
 * 
 * Queue Naming Convention:
 * ----------------------
 * grida_hosted_evt_[event_type]_jobs
 * 
 * Examples:
 * - grida_hosted_evt_new_organization_jobs
 * - grida_hosted_evt_marketing_campaign_jobs
 * - grida_hosted_evt_user_onboarding_jobs
 * 
 * Event Payload Structure:
 * ----------------------
 * {
 *   "event_type": string,      // Type of event (e.g., "new_organization")
 *   "organization_id": uuid,   // Affected organization
 *   "timestamp": timestamp,    // When the event occurred
 *   ...additional_data        // Event-specific data
 * }
 */
 
CREATE SCHEMA IF NOT EXISTS grida_hosted;
ALTER SCHEMA grida_hosted OWNER TO "postgres";


GRANT USAGE ON SCHEMA grida_hosted TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA grida_hosted TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA grida_hosted TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA grida_hosted TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_hosted GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_hosted GRANT ALL ON ROUTINES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA grida_hosted GRANT ALL ON SEQUENCES TO service_role;

---------------------------------------------------------------------
-- [task queue - `grida_hosted_evt_new_organization_jobs`] --
---------------------------------------------------------------------
select from pgmq.create('grida_hosted_evt_new_organization_jobs');
alter table pgmq.q_grida_hosted_evt_new_organization_jobs enable row level security;
grant select on table pgmq.a_grida_hosted_evt_new_organization_jobs to pg_monitor;
grant select on table pgmq.q_grida_hosted_evt_new_organization_jobs to pg_monitor;
grant delete, insert, references, select, trigger, truncate, update on table pgmq.a_grida_hosted_evt_new_organization_jobs to service_role;
grant delete, insert, references, select, trigger, truncate, update on table pgmq.q_grida_hosted_evt_new_organization_jobs to service_role;


---------------------------------------------------------------------
-- [enqueue_new_organization_event] --
---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION grida_hosted.enqueue_new_organization_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM pgmq.send(
    queue_name := 'grida_hosted_evt_new_organization_jobs'::text,
    msg := jsonb_build_object(
      'object', 'evt_new_organization',
      'organization_id', NEW.id,
      'timestamp', now()
    )
  );
  RETURN NEW;
END;
$$;


---------------------------------------------------------------------
-- [trigger - enqueue_new_organization_event_on_insert] --
---------------------------------------------------------------------
CREATE TRIGGER enqueue_new_organization_event_on_insert AFTER INSERT ON public.organization FOR EACH ROW EXECUTE FUNCTION grida_hosted.enqueue_new_organization_event();