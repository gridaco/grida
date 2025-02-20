import MailAppFrame from "@/components/frames/mail-app-frame";

export default function MailFramePage() {
  return (
    <MailAppFrame
      sidebarHidden
      message={{
        at: "2021-10-06T14:00:00Z",
        from: {
          name: "Grida Forms",
          email: "notifications@forms.grida.co",
          avatar: "GR",
        },
        title: "New Feature Update",
      }}
      messages={[]}
    >
      <p>Dear team,</p>
      <p>
        Im excited to announce the release of our latest feature update. This
        release includes several new capabilities that will help you work more
        efficiently and effectively.
      </p>
      <p>Some of the key highlights include:</p>
      <ul>
        <li>Improved email search and filtering</li>
        <li>Enhanced email templates and signatures</li>
        <li>Seamless integration with our project management tools</li>
      </ul>
      <p>
        Weve been working hard to deliver these improvements, and were confident
        they will have a positive impact on your daily workflow. Please let me
        know if you have any questions or feedback.
      </p>
      <p>
        Best regards,
        <br />
        Jared
      </p>
    </MailAppFrame>
  );
}
