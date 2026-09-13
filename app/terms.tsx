import {
  LegalDocumentScreen,
  type LegalSection,
} from "@/components/legal/legal-document-screen";

const SECTIONS: LegalSection[] = [
  {
    title: "Acceptance of these terms",
    body: [
      "By creating or using a KeepFlip account, you agree to these Terms of Service. Do not use KeepFlip when you do not agree to them.",
      "You must provide accurate account information and protect the credentials used to access your account.",
    ],
  },
  {
    title: "KeepFlip services",
    body: [
      "KeepFlip helps users organize items, analyze item photos, estimate condition and resale value, research repairs, and prepare marketplace activity.",
      "Features may change as the service develops. KeepFlip may add, modify, suspend, or discontinue features when reasonably necessary.",
    ],
  },
  {
    title: "Analysis and valuation estimates",
    body: [
      "Item identification, condition assessments, repair information, and valuations are estimates generated from available photos, user-provided information, automated systems, and third-party market data.",
      "Results are not guarantees of authenticity, condition, safety, repairability, selling price, or financial outcome. You remain responsible for inspecting an item and deciding whether to buy, sell, repair, use, or list it.",
    ],
  },
  {
    title: "Your photos and item content",
    body: [
      "You retain ownership of the photos, descriptions, and other item information you submit.",
      "You give KeepFlip permission to store, process, resize, analyze, and transmit that content only as needed to operate, secure, and improve the requested features.",
    ],
  },
  {
    title: "Acceptable use",
    body: [
      "Do not use KeepFlip to violate law, infringe another person's rights, misrepresent an item, distribute malicious code, interfere with the service, or access another user's account.",
      "Do not submit content you do not have the right to use. Marketplace listings and communications must be accurate and lawful.",
    ],
  },
  {
    title: "eBay services and content",
    body: [
      "When you connect an eBay account or use KeepFlip features that display eBay content, your use of that content is subject to the eBay User Agreement and, to the extent KeepFlip sublicenses the right to display eBay content through the app, the eBay API License Agreement.",
      "By using those features, you agree to be bound by the applicable terms of the eBay API License Agreement for that sublicense. eBay is an intended third-party beneficiary of that sublicense and may enforce its terms, and the sublicense is revocable at any time.",
      "KeepFlip does not provide users with eBay API credentials or programmatic control over eBay APIs. eBay content remains owned by eBay or its licensors and may be refreshed, limited, or removed when required by eBay or applicable policy.",
    ],
  },
  {
    title: "Subscriptions and store billing",
    body: [
      "KeepFlip may offer paid features through subscriptions. Google Play or the Apple App Store processes the transaction, and the applicable store terms govern payment, renewal, cancellation, refunds, taxes, and billing instruments. RevenueCat helps KeepFlip present subscription offerings, reconcile purchases, restore access, and maintain subscription status.",
      "KeepFlip does not ask for or store your full payment-card number in the app. If a payment fails or a subscription expires, KeepFlip may limit paid features until the applicable store and RevenueCat confirm renewed access.",
    ],
  },
  {
    title: "Third-party services",
    body: [
      "The current KeepFlip implementation uses Appwrite for account authentication, database and table records, file storage, realtime updates, push-target registration, and server-side Functions. Android builds may also use Firebase Analytics and Firebase Cloud Messaging for analytics and push delivery, depending on the build and your device settings.",
      "KeepFlip uses RevenueCat and the applicable app store for subscriptions; Appodeal and its mediation partners for advertising where enabled; eBay for marketplace integrations and content; OpenAI for Flip and requested AI analysis; SerpApi for market research; and Google Maps Platform Places services for nearby repair-provider search when that feature is enabled.",
      "Provider configuration can vary by release and feature. These providers have their own terms, privacy notices, availability, and security practices, and their processing may occur outside your country. KeepFlip is not responsible for a third party's independent services, listings, transactions, or policies.",
    ],
  },
  {
    title: "Account suspension and termination",
    body: [
      "You may stop using KeepFlip at any time. KeepFlip may restrict or terminate access when an account creates security risk, violates these terms, abuses the service, or must be restricted to comply with law.",
    ],
  },
  {
    title: "Disclaimers and liability",
    body: [
      "KeepFlip is provided on an as-available basis. To the extent permitted by law, KeepFlip disclaims warranties that the service will always be uninterrupted, error-free, or suitable for every purpose.",
      "To the extent permitted by law, KeepFlip is not liable for indirect, incidental, special, consequential, or lost-profit damages arising from use of the service or reliance on an analysis or valuation.",
    ],
  },
  {
    title: "Changes to these terms",
    body: [
      "KeepFlip may update these terms as the app changes or legal requirements develop. The effective date on this screen identifies the current version.",
    ],
  },
];

export default function TermsScreen() {
  return (
    <LegalDocumentScreen
      effectiveDate="September 11, 2026"
      intro="These terms explain the rules that apply when you create an account or use KeepFlip."
      sections={SECTIONS}
      title="Terms of Service"
    />
  );
}
