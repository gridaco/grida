# Jobs Queue Poller

A simple Python-based queue poller for processing background jobs using Supabase pgmq queue and Resend for email processing.

## Setup

1. Install uv if you haven't already:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

2. Create a virtual environment and install dependencies:

```bash
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
uv pip install -r requirements.txt
```

3. Create a `.env` file with the following variables:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
RESEND_API_KEY=your_resend_api_key
POLL_BATCH_SIZE=10  # Optional, defaults to 10
VISIBILITY_TIMEOUT=3600  # Optional, defaults to 3600 seconds
```

## Running the Worker

```bash
deno run dev
```

## Railway Deployment

1. Create a new service in Railway
2. Connect your GitHub repository
3. Set the environment variables in Railway's dashboard
4. Deploy!

The service will automatically start the queue poller when deployed.
