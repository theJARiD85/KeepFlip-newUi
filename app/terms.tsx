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
    title: "Third-party services",
    body: [
      "KeepFlip may rely on services such as Appwrite, artificial-intelligence providers, market-research providers, advertising providers, mapping providers, and external marketplaces.",
      "Those services may have their own terms and availability. KeepFlip is not responsible for a third party's independent services, listings, transactions, or policies.",
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
      effectiveDate="July 21, 2026"
      intro="These terms explain the rules that apply when you create an account or use KeepFlip."
      sections={SECTIONS}
      title="Terms of Service"
    />
  );
}
