import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Metadata } from "next";

const shortcuts: [string, string, string][] = [
  [
    "User Interview",
    "Gather initial feedback for a new app feature",
    "User interview form designed for gathering initial feedback from users about a new app feature. Includes fields for user demographics and open-ended questions about user experience.",
  ],
  [
    "User Interview Detailed",
    "In-depth user interview for beta product trials",
    "Comprehensive user interview form targeting specific user groups for a beta product trial. Includes sections for contact information, availability for follow-up interviews, and detailed questions regarding user preferences and suggestions.",
  ],
  [
    "Food Ordering",
    "Simple restaurant food ordering form",
    "Basic food ordering form for a small restaurant, allowing customers to select dishes from a predefined menu and specify quantities.",
  ],
  [
    "Food Ordering Detailed",
    "Advanced catering order form with dietary options",
    "Advanced food ordering form for a catering business, with options for multiple menu items, dietary restrictions, choice of delivery or pickup, and online payment processing.",
  ],
  [
    "Event Registration",
    "Register for a local community workshop",
    "Simple event registration form for a local community workshop, with fields for participant name, contact details, and number of attendees.",
  ],
  [
    "Event Registration Detailed",
    "Detailed form for multi-day conference registration",
    "Detailed event registration form for a multi-day conference, including personal information, preferences for different tracks and sessions, dietary needs, and accommodation requirements.",
  ],
  [
    "Feedback Survey",
    "Retail customer feedback survey",
    "Customer feedback survey form for a retail store, focusing on customer satisfaction with service, product variety, and overall shopping experience.",
  ],
  [
    "Feedback Survey Detailed",
    "Detailed tech product feedback survey",
    "In-depth feedback survey form for a tech company's product release, featuring sections on hardware performance, software usability, customer support interaction, and space for detailed user comments.",
  ],
  [
    "Job Application",
    "Basic job application form for entry-level positions",
    "Standard job application form for an entry-level position, requesting basic personal details, educational background, and current employment status.",
  ],
  [
    "Job Application Detailed",
    "Comprehensive application for senior roles",
    "Comprehensive job application form for a senior role, requiring detailed employment history, links to professional portfolio, motivations for applying, and the ability to upload a resume and cover letter.",
  ],
];

export const metadata: Metadata = {
  title: "AI Forms Builder | Grida Forms",
  description: "Grida Forms AI Forms Builder",
};

export default function AIHome() {
  const placeholder =
    shortcuts[Math.floor(Math.random() * shortcuts.length)][1];

  return (
    <main className="flex flex-col w-full min-h-screen items-center justify-center">
      <div className="text-center mb-5">
        <h2 className="text-5xl font-bold">Build Forms with AI</h2>
        <p className="mt-2 text-lg text-gray-500 dark:text-gray-400">
          Enter your AI prompt and let the magic happen.
        </p>
      </div>
      <div className="w-full max-w-md mx-auto space-y-4 border rounded-lg shadow-lg p-4">
        <form className="space-y-4" method="POST" action="/playground/with-ai">
          <div className="space-y-1">
            <Textarea
              autoFocus
              className="min-h-[100px]"
              name="prompt"
              id="prompt"
              placeholder={placeholder}
            />
          </div>
          <Button className="w-full" type="submit">
            Generate
          </Button>
        </form>
      </div>
    </main>
  );
}
