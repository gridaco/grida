import React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@app/ui/components/alert-dialog";
import Image from "next/image";

export default function WelcomeDialog(
  props: React.ComponentProps<typeof AlertDialog>
) {
  return (
    <AlertDialog {...props}>
      <AlertDialogContent className="overflow-hidden border-none">
        <AlertDialogTitle className="sr-only">WelcomeDialog</AlertDialogTitle>
        <AlertDialogDescription>
          You&#39;re about to launch a referral campaign powered by{" "}
          <strong>Grida WEST</strong> — the easiest way to grow through sharing.
        </AlertDialogDescription>
        <article className="prose prose-sm dark:prose-invert">
          <Image
            src="/west/logo-with-type.png"
            alt={"west poster"}
            width={400}
            height={200}
            className="h-8 w-auto pointer-events-none select-none"
          />
          <div className="absolute -z-10 -left-0 -right-0 bottom-0 h-96 pointer-events-none select-none">
            {/* gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-white to-white/50"></div>
            <Image
              src="/west/poster.png"
              alt={"west poster"}
              width={800}
              height={800}
              className="absolute inset-0 -z-10 object-cover w-full"
            />
          </div>
          <h2 id="-welcome-to-the-wild-west">🤠 Welcome to the Wild WEST</h2>
          <p>
            You&#39;re about to launch a referral campaign powered by{" "}
            <strong>Grida WEST</strong> — the easiest way to grow through
            sharing.
          </p>
          <p>Choose your style:</p>
          <ul>
            <li>
              <strong>Milestone Rewards</strong> – more invites, better prizes
            </li>
            <li>
              <strong>Prelaunch Waitlists</strong> – rise in ranks by referring
            </li>
            <li>
              <strong>Newsletter Referrals</strong> – unlock perks for sharing
            </li>
            <li>
              <strong>Viral Giveaways</strong> – invite friends, boost your
              chances
            </li>
            <li>
              <strong>2-Sided Referrals</strong> – reward both inviter and
              invitee
            </li>
          </ul>
          <p>All campaigns come with:</p>
          <ul>
            <li>✅ Invite &amp; reward tracking</li>
            <li>✅ Built-in landing &amp; dashboard pages</li>
            <li>✅ Event analytics</li>
            <li>✅ Secure-by-default setup</li>
          </ul>
          <p>
            No code needed — but devs can go wild later.
            <br />
            Let’s ride. 🚀
          </p>
        </article>
        <AlertDialogFooter>
          <AlertDialogCancel>Get Started</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
