import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { Resend } from "https://esm.sh/resend@4.5.1";
import { TEMPLATES } from "./templates.ts";

const QUEUE_NAME = "grida_hosted_evt_new_organization_jobs";

// Initialize Supabase client
const client = createClient(
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
    organization_id: string;
    timestamp: string;
  };
}

interface Organization {
  id: string;
  name: string;
  created_at: string;
  owner: {
    email: string;
    first_name: string;
  };
}

interface EmailParams {
  from: string;
  to: string[];
  subject: string;
  html: string;
  tags: { name: string; value: string }[];
  scheduledAt?: string;
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

  private async getOrganizationData(
    organizationId: string
  ): Promise<Organization> {
    const { data, error } = await client
      .from("organization")
      .select()
      .eq("id", organizationId)
      .single();

    if (error || !data) {
      throw new Error(`Organization not found: ${organizationId}`);
    }

    // Ensure the owner data is properly typed
    const owner = Array.isArray(data.owner) ? data.owner[0] : data.owner;
    if (!owner || !owner.email || !owner.first_name) {
      throw new Error(`Invalid owner data for organization: ${organizationId}`);
    }

    return {
      id: data.id,
      name: data.name,
      created_at: data.created_at,
      owner: {
        email: owner.email,
        first_name: owner.first_name,
      },
    };
  }

  private async sendEmail({
    to,
    subject,
    html,
    fromEmail,
    scheduledAt,
  }: {
    to: string;
    subject: string;
    html: string;
    fromEmail: string;
    scheduledAt?: string;
  }): Promise<boolean> {
    try {
      const params: EmailParams = {
        from: fromEmail,
        to: [to],
        subject,
        html,
        tags: [
          { name: "type", value: "welcome_email" },
          {
            name: "environment",
            value: Deno.env.get("ENVIRONMENT") ?? "development",
          },
        ],
        scheduledAt,
      };

      const email = await resend.emails.send(params);
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
          const orgData = await this.getOrganizationData(organization_id);
          const owner = orgData.owner;

          // Prepare template data
          const templateData = {
            first_name: owner.first_name || "there",
            organization_name: orgData.name || "your organization",
          };

          // Get and format the template
          const template = TEMPLATES.organization_onboarding_welcome_email;
          const htmlContent = template.html.replace(
            /{(\w+)}/g,
            (_, key) => templateData[key as keyof typeof templateData] || ""
          );

          // Send to organization owner's email
          return await this.sendEmail({
            to: owner.email,
            subject: template.subject,
            html: htmlContent,
            fromEmail: "Universe <universe@grida.co>",
            scheduledAt: "in 5 min",
          });
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
