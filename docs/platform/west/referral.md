## Working Draft

this is my current db design, I think this is bad for few reasons.

1. I intended to write a general model for campaigns, I soon relized that is not possible, at least fully utilizing the db features.
2. I need to fully utilize the db features, like triggers and constraints, relations, in order to make my service reliable and easy to maintain.
3. the good example why current model is "bad" can be found in "tokens" - I tried to build a universal system, but the "referral" by nature is just another system that has its own features, that cannot be shared, and raises too many exception with the "quest model"
4. one example is, the who ever accepts the invitation becomes a participant, but this is a "shared quest" where the inviter relies on progress of invitee's onboarding process.

Here are some extra business logics, specific to referral campaign.

1. admin can choose the mode of the referral campaign.
   one is "sending an invitation" and one is "joining with referrer code"

"sending an invitation", is host guest creates new invitation per anonymous, then sending that to sms or what ever channels, this can only be claimed once. and linked to who ever claims it.

"joining with referrer code" is a conventional way, less of a game, but a practical and useful for always-running campaign type. it's best suits for saas business, and identical to refer-a-friend how dropbox does it. host shares "my uniqye code", who ever enters that code will (may or may not) be rewarded double-sided.

2. rewarding and milestone
   admin can set a milestone, per sucessful quest invitation (e.g. simple as accepts an invitation - or with custom events or to complete dedicated steps - e.g. sign up form A)

admin sets a reward per milestone, mapped with a successful number of invitation quest. this can be linear, like 1:$10 2:$10 3:$10 - which means, when host successfully makes the guest complete the quest for 3 times, they will be receiving $30 in total.

to make things easy, there is no milestone for guest, juest yes / no - with flat reward.

3. reward
   reward can be described with a text, since this cannot be regularized. if this is a random draft event, then the reward will be (at least on our system) be a "ticket" and more ticket the user has, more chances to win, and will be all marked as redeemed, since we only care about our system. (because there is no truly a way to manage all other)

so the reward is a "right to excahnge for certain value"

for dashboard feature, the value can still be described in currency and amount (fixed rate) - so we can show some money values in sum on admin's dashboard - but won't be truely accurate

4. reward token / reward exchange token
   since the reward can be a virtual product, like a credit, we need this "exchange token" model, to let admin decides and tells our system if the reward is givven and the exchange token is redeemed.

5. event / custom event
   event is a user-defined custom event (some might be built in) to let us track the progress of the quest. since this requires real-world interaction, perhaps on admin's website, when guest does something over their platform, they should let us know if certain event is triggered, and our db decides if the quest is completed / has progress.

6. quest / progress / quest definition.
   admin defines the quest, as simple as possible, that requires steps of certain events to be triggered. e.g. signup_complete, form_a_complete, purchase_complete. there cannot be more complex then linear step, like counting. the counting or other complex logics shall be handled on their platform, we will only receive the final events.

by that definition, each quest will have a progress.

---

I want you to answer as a CTO, for building a great db design that is solid, but with room for flexibility to move fast.

here are some considerations.

1. general db design principles
2. knwon limitations
3. how to handle the campaign confuguration change. - e.g. quest definition change

<!--  -->

## Referral Campaign Modes

1. Fixed referrer code

When anon uses this code, an invitation will be automatically created. anon will complete the signup process, and this invitation will be claimed.

2. Manual Invitation

When referrer creates an invitation, a unique code will be generated with the invitation. Anon will receive this invitation, and when anon uses this code to signup, the invitation will be claimed.

## Knwon limitations (will fix)

Cannot enforce either policy. who ever has access to the primary referrer code can act as a referrer, thus create new invitation.
