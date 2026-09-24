import {
  LegalDocumentScreen,
  type LegalSection,
} from "@/components/legal/legal-document-screen";

const SECTIONS: LegalSection[] = [
  {
    title: "Information KeepFlip collects",
    body: [
      "Account information may include your name, email address, account identifier, authentication status, and related profile settings.",
      "Item information may include photos, descriptions, categories, condition notes, repair details, analysis results, valuations, inventory records, and marketplace activity you choose to create.",
      "Technical information may include device type, operating system, app version, IP address, diagnostic events, advertising identifiers, and security or session information.",
      "Firebase services used by KeepFlip may generate a Firebase installation or app-instance identifier and process app or package information, IP address, notification-delivery metadata, and analytics or diagnostic events. What is collected depends on the enabled Firebase services, whether you use KeepFlip on Android or the web, and your device or browser privacy settings.",
    ],
  },
  {
    title: "Location and sourcing trips",
    body: [
      "KeepFlip requests foreground location when you choose a location-dependent feature. When you manually start a sourcing trip, KeepFlip requests foreground location and, on supported native builds, background location so it can continue measuring mileage while the app is not visible.",
      "Location tracking starts only after you grant the relevant permission and start an active sourcing trip. It stops when you close the trip. While the trip is active, KeepFlip processes location points to calculate distance and may temporarily keep the current tracking state on your device. The service record stores the mileage total, point count, and related trip metadata rather than a user-facing route history.",
      "You may deny, disable, or revoke location permission in your device settings. The related location-dependent feature, including sourcing-trip mileage, may not work without that permission.",
    ],
  },
  {
    title: "Connected eBay accounts",
    body: [
      "If you choose to connect an eBay account, KeepFlip may receive an eBay user identifier, display username, OAuth access and refresh tokens, token-expiration information, connection status, and the marketplace environment needed to maintain that connection.",
      "Depending on the feature you use and the permissions you approve with eBay, KeepFlip may request eBay listing, account, messaging, fulfillment, or other marketplace data needed to perform that feature.",
      "KeepFlip does not collect your eBay password. OAuth tokens are stored in encrypted form, and the immutable eBay user identifier used for account-deletion matching is stored as a keyed hash where supported by the KeepFlip connection service.",
    ],
  },
  {
    title: "Connected bank accounts and Plaid transactions",
    body: [
      "If you choose to connect a business bank account through Plaid, KeepFlip may process the financial institution name and identifiers, Plaid connection and account identifiers, selected account name, type, subtype, masked account number, and connection status. Plaid handles the bank sign-in flow; KeepFlip does not receive your online-banking credentials.",
      "For the transactions feature, Plaid may provide transaction identifiers, account identifiers, amounts, currencies, transaction and authorization dates, merchant or payee names, transaction names, categories, pending status, transaction codes, and related sync or removal information. KeepFlip uses this data to identify eligible outgoing business expenses and import them into Books. Pending items, transfers, deposits, refunds, income, and other excluded records may be retained for classification or change handling but are not automatically included in expense totals.",
      "Plaid access tokens are retained only by KeepFlip's server-side Books service in encrypted form; they are not exposed to the app client. Plaid processes information under its own privacy notice and terms. Disconnecting a bank account stops future imports, removes the Plaid connection from Plaid, and clears KeepFlip's stored access token; existing Books records are not automatically deleted.",
    ],
  },
  {
    title: "Subscriptions and purchases",
    body: [
      "If you purchase, restore, renew, or manage a KeepFlip subscription, Google Play or the Apple App Store processes the transaction. RevenueCat may receive an app-user identifier, product or plan and store identifiers, purchase and entitlement history, subscription status, transaction and expiration information, and renewal, restore, or management events needed to provide access.",
      "KeepFlip does not receive your full payment-card number through the app. The applicable store controls payment details, taxes, refunds, and billing instruments.",
    ],
  },
  {
    title: "How information is used",
    body: [
      "KeepFlip uses information to create and secure accounts, operate the scanner, analyze items, provide valuations, save inventory, support marketplace and repair features, prevent abuse, diagnose failures, and improve the service.",
      "Connected eBay information is used only to provide the eBay features you request, maintain or revoke the connection, enforce security controls, and comply with eBay marketplace account-deletion requirements.",
      "Advertising identifiers and related technical information may be used to deliver, measure, limit, and improve advertising where advertising is enabled.",
      "Subscription and purchase information is used to present plans, process purchases through the applicable store, restore or renew access, reconcile store events, prevent abuse, and enforce the subscription status recorded by KeepFlip's server.",
      "Connected bank and Plaid transaction information is used to maintain the connection you authorized, synchronize transaction changes, identify eligible outgoing business expenses, and create or update related Books records. KeepFlip does not provide tax, legal, or financial advice through imported transaction data.",
    ],
  },
  {
    title: "Photos and automated analysis",
    body: [
      "Photos and item details may be uploaded to secure storage and sent to service providers that perform identification, image processing, model generation, valuation research, or other requested analysis.",
      "When you use Flip assistant, item identification, listing generation, repair or parts research, or market research, the relevant photos, text, item attributes, and request context may be processed by OpenAI, SerpApi, eBay APIs, or Google Maps Platform when the requested feature and provider are enabled. These providers apply their own privacy notices and terms.",
      "Do not upload sensitive personal information that is unrelated to the item being analyzed.",
    ],
  },
  {
    title: "How information is shared",
    body: [
      "The current KeepFlip service stack uses Appwrite for account authentication, databases and tables, file storage, realtime updates, push-target registration, and server-side Functions. Android builds may use Firebase Analytics and Firebase Cloud Messaging for analytics and notification delivery where enabled. The KeepFlip web app may use Firebase Analytics for aggregated website and feature-usage measurement.",
      "KeepFlip may share limited information with RevenueCat and the applicable app store for subscription and purchase reconciliation. When web billing is enabled, RevenueCat uses Stripe as KeepFlip's web payment gateway. KeepFlip may also share information with OpenAI for Flip and requested AI analysis; SerpApi for market research; Google Maps Platform for nearby repair-provider search; and support or infrastructure providers when needed to operate the requested feature.",
      "When you use connected eBay features, information may be exchanged with eBay through eBay APIs according to the permissions you approved and the applicable eBay terms and privacy notice.",
      "When you connect a bank account, Plaid processes the authorized bank-link and transaction requests needed to provide the connection. KeepFlip sends Plaid requests from its server-side Books service and receives the account and transaction data described above; KeepFlip does not send your online-banking credentials to its app client.",
      "Tenjin, KeepFlip's mobile attribution provider, receives app install and session information and may process device information, IP address, advertising identifiers, and event names for completed account registrations and saved inventory items to measure advertising campaign and post-install performance. Advertising partners, including Appodeal and its service partners, may process device information, IP address, advertising identifiers, consent choices, ad impressions, clicks, and approximate location when permitted.",
      "KeepFlip may also disclose information when required by law, to protect users or the service, or as part of a merger, acquisition, financing, or transfer of the business.",
    ],
  },
  {
    title: "Data retention and eBay deletion requests",
    body: [
      "KeepFlip retains account and item information while your account is active and for as long as reasonably necessary to provide the service, resolve disputes, maintain security, and comply with legal obligations.",
      "Temporary analysis files may be deleted after processing. Some backups and service-provider records may remain for a limited period where permitted by applicable requirements.",
      "When KeepFlip receives a valid eBay marketplace account-deletion notification for a connected eBay user, KeepFlip deletes the associated stored eBay connection data unless specific information must be retained for a demonstrable legal obligation.",
      "While a bank account is connected, KeepFlip retains the encrypted Plaid access token, connection metadata, and imported transaction records needed to synchronize and display Books activity. Disconnecting clears the access token and stops future imports, but existing imported transaction and Books records may remain while your account is active or as reasonably necessary for security, dispute resolution, bookkeeping history, and legal obligations.",
    ],
  },
  {
    title: "International processing and provider notices",
    body: [
      "Some service providers may process information in countries other than the one where you live. Provider-specific retention, security, and cross-border practices are described in their current privacy notices and terms, which may change independently of KeepFlip.",
      "Review the applicable provider notices before enabling an integration or using a feature that sends information to that provider.",
    ],
  },
  {
    title: "Your choices",
    body: [
      "You may choose whether to provide photos, location access, and certain device permissions. Disabling a permission may prevent the related feature from working.",
      "You may disconnect your eBay account from KeepFlip. Disconnecting stops future authenticated eBay access through that connection and initiates removal or revocation of connection credentials as supported by the service.",
      "You may disconnect a linked bank account from Books. Disconnecting stops future Plaid transaction imports and removes the stored connection token; existing Books records remain unchanged unless you separately delete eligible records or request account deletion.",
      "Device advertising settings may allow you to reset or limit the use of an advertising identifier. Consent controls may also be shown where required.",
      "You may request access, correction, or deletion of eligible account information by contacting KeepFlip support.",
    ],
  },
  {
    title: "Security",
    body: [
      "KeepFlip uses reasonable administrative and technical safeguards, including Appwrite-based authentication and access controls, Firebase services where enabled, encrypted server-side storage for connected eBay OAuth tokens and Plaid access tokens, secure device storage for local session material where supported, and integrity checks for marketplace account-deletion notifications. No storage or transmission system can be guaranteed completely secure.",
    ],
  },
  {
    title: "Children",
    body: [
      "KeepFlip is not directed to children under 13, and KeepFlip does not knowingly collect personal information from children under 13.",
    ],
  },
  {
    title: "Changes to this policy",
    body: [
      "KeepFlip may update this Privacy Policy as features, providers, or legal requirements change. The effective date on this screen identifies the current version.",
    ],
  },
];

export default function PrivacyScreen() {
  return (
    <LegalDocumentScreen
      effectiveDate="September 22, 2026"
      intro="This policy explains what KeepFlip collects, why it is used, and the choices available to you."
      sections={SECTIONS}
      title="Privacy Policy"
    />
  );
}
