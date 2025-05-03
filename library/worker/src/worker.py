import os
import json
import time
import logging
import signal
import click
from dotenv import load_dotenv
from supabase import create_client, Client
from embedding import embed

QUEUE_NAME = "grida_library_object_worker_jobs"
BUCLET_NAME = "library"

# ----------------------------------------------
# Worker for Supabase pgmq queue 'grida_library_object_worker_jobs' using Supabase Python client
#
# Task payload JSON format:
# {
#     "object_id": "<UUID>",
#     "path": "/rel/path/to/image/from/bucket/image.png",
#     "mimetype": "<image_mimetype>"
# }
#
# This script polls the queue, processes each task by calling
# the AWS Titan embedding via `embed()`, stores the result,
# and acknowledges successful tasks.
# ----------------------------------------------


# Initialize logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger(__name__)


# Graceful shutdown flag
global running
running = True


def shutdown(signum, frame):
    global running
    logger.info("Received signal %s, shutting down...", signum)
    running = False


# Register signals
signal.signal(signal.SIGINT, shutdown)
signal.signal(signal.SIGTERM, shutdown)


class EmbeddingWorker:
    supabase: Client
    library_client: Client
    queue_client: Client
    queue_name: str
    poll_batch_size: int
    visibility_timeout: int

    def __init__(self, supabase_url, supabase_key, queue_name, poll_batch_size, visibility_timeout):
        self.supabase: Client = create_client(supabase_url, supabase_key)
        self.library_client = self.supabase.schema("grida_library")
        self.queue_client = self.supabase.schema("pgmq_public")
        self.queue_name = queue_name
        self.poll_batch_size = poll_batch_size
        self.visibility_timeout = visibility_timeout

    def q_read(self):
        res = self.queue_client.rpc(
            "read",
            {
                "queue_name": self.queue_name,
                "sleep_seconds": self.visibility_timeout,
                "n": self.poll_batch_size,
            }
        ).execute()
        return res.data or []

    def q_ack(self, message_id: str):
        res = self.queue_client.rpc(
            "archive",
            {"queue_name": self.queue_name, "message_id": message_id}
        ).execute()
        return res.data

    def upsert_embedding(self, object_id: str, vector: list):
        res = self.library_client.table("grida_object_embedding").upsert({
            "object_id": object_id,
            "embedding": vector
        }).execute()
        return res.data

    def run(self):
        logger.info("Worker started, polling queue '%s'...", self.queue_name)

        while running:
            try:
                rows = self.q_read()

                if not rows:
                    time.sleep(1)
                    continue

                for msg in rows:
                    message_id = msg.get("message_id")
                    message_body = msg.get("message")
                    try:
                        payload = message_body if isinstance(
                            message_body, dict) else json.loads(message_body)
                        object_id = payload["object_id"]
                        object_path = payload["path"]
                        obj = self.supabase.storage.from_(BUCLET_NAME)\
                            .download(
                                object_path, options={
                                    "transform": {"quality": 80}
                                })

                        mimetype = payload.get("mimetype")
                        logger.info(
                            "Processing object_id=%s", object_id)
                        vector = embed(obj, mimetype)
                        self.upsert_embedding(object_id, vector)
                        self.q_ack(message_id)
                        logger.info("Completed object_id=%s", object_id)

                    except Exception as task_err:
                        logger.error(
                            "Task error (message_id=%s): %s", message_id, task_err)

            except Exception as e:
                logger.exception("Worker loop error: %s", e)
                time.sleep(5)

        logger.info("Worker stopped.")


@click.command()
@click.option("--env", type=click.Path(exists=True), help="Path to the .env file")
def cli(env):
    """Command line interface for the worker."""
    if env:
        load_dotenv(env, override=True)
    else:
        load_dotenv()

    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY")
    POLL_BATCH_SIZE = int(os.getenv("POLL_BATCH_SIZE", "10"))
    VISIBILITY_TIMEOUT = int(
        os.getenv("VISIBILITY_TIMEOUT", "3600"))  # seconds

    worker = EmbeddingWorker(
        supabase_url=SUPABASE_URL,
        supabase_key=SUPABASE_KEY,
        queue_name=QUEUE_NAME,
        poll_batch_size=POLL_BATCH_SIZE,
        visibility_timeout=VISIBILITY_TIMEOUT
    )
    worker.run()


if __name__ == "__main__":
    cli()
