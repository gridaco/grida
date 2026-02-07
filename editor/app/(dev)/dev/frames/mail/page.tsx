import {
  EmailFrame,
  EmailFrameSubject,
  EmailFrameSender,
  EmailFrameBody,
} from "@/components/frames/email-frame";

export default function MailFramePage() {
  return (
    <main className="container max-w-2xl mx-auto py-10">
      <EmailFrame className="flex flex-col">
        <EmailFrameSubject>New Feature Update</EmailFrameSubject>
        <EmailFrameSender
          name="Grida Forms"
          email="notifications@forms.grida.co"
          date="2021-10-06T14:00:00Z"
        />
        <EmailFrameBody className="prose prose-stone dark:prose-invert max-w-none">
          <p>Dear team,</p>
          <p>
            Im excited to announce the release of our latest feature update. This
            release includes several new capabilities that will help you work
            more efficiently and effectively.
          </p>
          <p>Some of the key highlights include:</p>
          <ul>
            <li>Improved email search and filtering</li>
            <li>Enhanced email templates and signatures</li>
            <li>Seamless integration with our project management tools</li>
          </ul>
          <p>
            Weve been working hard to deliver these improvements, and were
            confident they will have a positive impact on your daily workflow.
            Please let me know if you have any questions or feedback.
          </p>
          <p>
            Best regards,
            <br />
            Jared
          </p>
        </EmailFrameBody>
      </EmailFrame>
    </main>
  );
}
