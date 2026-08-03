Hello,

Thank you for the follow-up. To answer directly: **Prova is completely free.** There is no In-App Purchase, no subscription, no external purchase path, and no paid tier of any kind in this build. There are therefore no paid services for anyone to use, purchase, restore or unlock. Detailed answers to each of your four questions are below, and we have proactively flagged the one payment-adjacent feature in the app so you have the full picture.

---

**1. Who are the users that will use the paid services in the app?**

There are no paid services in the app, so no user of any type has access to one. All three account types — Student, Personal and Teacher — receive every feature free, with no limits and no paid tier available to them.

Because your message asks us to explain our business model, we set out our *intended* direction in full at the end of this reply. In summary, we plan for individual musicians and individual private teachers to be offered optional subscriptions **through Apple In-App Purchase**, and separately to license Prova to schools and music departments as an institutional product. None of that exists in this build: nothing is on sale to anyone, through any channel.

**2. Where can users purchase the subscriptions that can be accessed in the app?**

Nowhere. There are no subscriptions, so there is nothing to purchase — not inside the app, and not outside it either.

There is no In-App Purchase, no subscription, no website checkout, no payment processor, and no "contact us to upgrade" route. The app contains no purchase surface of any kind: no prices, no plan selector, no upgrade button, and no paywall screen. The binary includes no commerce or billing SDK — no StoreKit purchase code, no RevenueCat, no Stripe, and no third-party payment library.

**3. What specific types of previously purchased content and features can a user access in the app?**

None. Prova has never sold anything, so no user has any prior purchase to access or restore. There is deliberately no "Restore Purchases" flow, because nothing has ever been purchasable.

Every account is fully unlocked from sign-up. There is no entitlement check, licence key, promo code, or account tier that a user could obtain by paying.

**4. What paid content, subscriptions, or features are unlocked within the app that do not use In-App Purchase?**

None. No feature in Prova sits behind a payment of any kind.

Every feature is free for every account, with no limits: AI-generated practice plans, the daily practice view and timers, progress tracking and streaks, the song library and Learn-a-Song step plans, all four mini-games (unlimited plays), the practice journal, messaging, the AI chat assistant, and the full teacher toolkit (unlimited students, lesson notes, calendar, assignable packs and parent progress reports).

---

**One feature we want to flag proactively**

Prova includes a "Performance Mode" for musicians playing a live show. In it, the app displays a QR code that the audience physically present at the venue can scan to open a web page where they can request a song. If the performer has optionally saved their own third-party payment link in their profile (for example their own PayPal, Venmo or Cash App link), that page also shows that link so an audience member can tip them.

We believe this sits outside In-App Purchase, for these reasons:

- It is a **person-to-person payment for a real-world live performance**, not digital content or services delivered in the app.
- **Nothing in Prova is unlocked by it.** No feature, content, or functionality changes whether a tip is sent or not.
- **Prova does not process, hold, receive, or take any share of the money.** The link belongs to the user, and any transaction happens entirely on that third-party service, outside our app.
- The payment is between two people who are physically together at a venue, for a performance happening in the room.

This is entirely optional and off by default — the field is blank unless a user chooses to enter their own link. If you would prefer we remove or change this feature, we will do so immediately and submit an updated build.

---

**A note on terminology, in case it caused confusion**

- **"Personal"** in the app is one of three *account roles* chosen at sign-up (Student / Personal / Teacher). "Personal" means a solo learner practising without a teacher. It is not a paid plan and carries no cost or extra features.
- **"Studio"** on our marketing website refers to a *teaching studio* (a teacher's group of students), not a subscription tier.

**Our intended business model, stated plainly**

Since your message asks to understand our business model before completing review, we would rather set it out now than leave it unstated.

Today, and in the version under review, nothing is sold at all. Looking ahead, we intend to earn revenue in two distinct ways, and we want to be explicit about which rule each falls under:

*1. Institutional licences, sold business-to-business to schools.* Prova is a classroom practice and management tool for music departments. We intend to license it directly to schools and music departments for their students, invoiced to the institution in the ordinary way that schools procure software. We understand this to fall under **Guideline 3.1.3(c) Enterprise Services**, which permits an app "sold directly by you to organizations or groups for their employees or students (for example professional databases and classroom management tools)" to let those enterprise users access previously-purchased subscriptions.

*2. Individual subscriptions — for both musicians and teachers — sold inside the app through Apple In-App Purchase.* We do intend to offer optional paid plans to individual users. This covers **both** an individual musician practising on their own **and** a private music teacher who buys for their own teaching studio. Both are single-user, consumer purchases.

Those plans will be presented on a paywall **inside the app** and purchased **entirely through StoreKit In-App Purchase**, at Apple's standard terms, with the price and subscription terms shown before purchase and a Restore Purchases option provided. They will not be sold on our website, by invoice, or through any other payment method. We understand this is required both by 3.1.1, which states that unlocking features or functionality within the app must use in-app purchase, and by 3.1.3(c), which states that "Consumer, single user, or family sales must use in-app purchase."

To be completely clear about where the line sits:

- A **school or music department** buying for its students is an institutional purchase, invoiced directly to the institution.
- An **individual teacher** buying for their own private teaching studio is a single-user consumer purchase, and goes through Apple In-App Purchase — not through our direct channel.
- An **individual musician** practising alone is likewise a consumer purchase through Apple In-App Purchase.

We will not use the institutional channel as a route to sell to individual users of any kind.

In both cases we will comply with the requirement in 3.1.3 that the app must not, within the app, encourage users toward a purchasing method other than In-App Purchase. **Prova will contain no button, link, price, or other call to action pointing to any external purchase.** Any conversation about school licensing happens outside the app entirely — on our website and by direct contact with the institution.

None of this exists in the build under review: there are no school licences on sale yet, no institutional accounts, no licence or seat fields in the app, and no billing of any kind. We are describing our intended direction so that our model is clear to you, not describing functionality present in this binary.

Our published Terms of Service already commit to the consumer half of this — section 6 reads: "Prova is currently free to use. If paid plans are introduced, they will be billed through your device's app store, and pricing and terms will be clearly presented before any purchase. No payment is taken without your explicit action."

We are happy to provide anything else that would help, and we can be reached through App Store Connect at any time.

Kind regards,
The Prova Team
