import type { Database } from "../../database/database-generated.types.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { Resend } from "https://esm.sh/resend@4.5.1";
import * as templates from "./templates.ts";

const QUEUE_NAME = "grida_hosted_evt_new_organization_jobs";

// Initialize Supabase client
const client = createClient<Database>(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_KEY") ?? ""
);

const pgmq_client = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_KEY") ?? "",
  {
    db: {
      schema: "pgmq_public",
    },
  }
);

// Initialize Resend
const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

interface QueueMessage {
  msg_id: string;
  message: {
    object: "evt_new_organization";
    organization_id: number;
    timestamp: string;
  };
}

class EmailWorker {
  private pollBatchSize: number;
  private visibilityTimeout: number;

  constructor(pollBatchSize: number = 10, visibilityTimeout: number = 3600) {
    this.pollBatchSize = pollBatchSize;
    this.visibilityTimeout = visibilityTimeout;
  }

  private async readQueue(): Promise<QueueMessage[]> {
    const { data, error } = await pgmq_client.rpc("read", {
      queue_name: QUEUE_NAME,
      n: this.pollBatchSize,
      sleep_seconds: this.visibilityTimeout,
    });

    if (error) throw error;
    return data || [];
  }

  private async acknowledgeMessage(messageId: string): Promise<void> {
    const { error } = await pgmq_client.rpc("archive", {
      queue_name: QUEUE_NAME,
      message_id: messageId,
    });

    if (error) throw error;
  }

  private async getOrganizationData(organization_id: number) {
    const { data: org, error: org_error } = await client
      .from("organization")
      .select("*")
      .eq("id", organization_id)
      .single();

    if (org_error) {
      throw new Error(`Organization not found: ${organization_id}`);
    }

    const { data: owner, error: owner_error } = await client
      .from("user_profile")
      .select("*")
      .eq("uid", org.owner_id)
      .single();

    if (owner_error) {
      throw new Error(`Owner not found: ${org.owner_id}`);
    }

    const { data: user, error: user_error } =
      await client.auth.admin.getUserById(org.owner_id);

    if (user_error) {
      throw new Error(`User not found: ${org.owner_id}`);
    }

    return {
      org: {
        id: org.id,
        name: org.name,
        email: org.email,
        created_at: org.created_at,
      },
      owner: {
        uid: owner.uid,
        name: owner.display_name,
        email: user.user.email,
        created_at: owner.created_at,
      },
    };
  }

  private async sendEmail({
    to,
    subject,
    html,
    text,
    fromEmail,
    scheduledAt,
  }: {
    to: string;
    subject: string;
    html?: string;
    text?: string;
    fromEmail: string;
    scheduledAt?: string;
  }): Promise<boolean> {
    try {
      const email = await resend.emails.send({
        from: fromEmail,
        to: [to],
        subject,
        react: undefined,
        html,
        text,
        tags: [
          { name: "type", value: "welcome_email" },
          {
            name: "environment",
            value: Deno.env.get("ENVIRONMENT") ?? "development",
          },
        ],
        scheduledAt,
      });
      console.log("Email sent successfully:", email);
      return true;
    } catch (error) {
      console.error("Error sending email:", error);
      return false;
    }
  }

  private async processMessage(message: QueueMessage): Promise<boolean> {
    try {
      const { object, organization_id } = message.message;

      switch (object) {
        case "evt_new_organization": {
          const { org, owner } =
            await this.getOrganizationData(organization_id);

          // Get and format the template
          const template = templates.organization_onboarding_welcome_email({
            organization_name: org.name,
            owner_name: owner.name,
          });

          const email = owner.email || org.email;

          if (email) {
            return await this.sendEmail({
              ...template,
              to: email,
            });
          } else {
            console.warn(`No email found for organization: ${organization_id}`);
            return false;
          }
        }
        default:
          console.warn(`Unexpected event type: ${object}`, message.message);
          return false;
      }
    } catch (error) {
      console.error("Error processing welcome email:", error);
      return false;
    }
  }

  async run(): Promise<void> {
    console.log("Starting email worker...");

    while (true) {
      try {
        const messages = await this.readQueue();

        if (!messages.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        for (const message of messages) {
          try {
            console.log(`Processing message_id=${message.msg_id}`);

            if (await this.processMessage(message)) {
              await this.acknowledgeMessage(message.msg_id);
              console.log(`Completed message_id=${message.msg_id}`);
            } else {
              console.error(`Failed to process message_id=${message.msg_id}`);
            }
          } catch (error) {
            console.error(
              `Error processing message_id=${message.msg_id}:`,
              error
            );
          }
        }
      } catch (error) {
        console.error("Worker loop error:", error);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }
}

// Start the worker
const worker = new EmailWorker(
  parseInt(Deno.env.get("POLL_BATCH_SIZE") ?? "10"),
  parseInt(Deno.env.get("VISIBILITY_TIMEOUT") ?? "3600")
);

await worker.run();
