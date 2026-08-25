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
      "Location is collected only when you grant permission and use a feature that needs location, such as nearby repair-provider research.",
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
    title: "How information is used",
    body: [
      "KeepFlip uses information to create and secure accounts, operate the scanner, analyze items, provide valuations, save inventory, support marketplace and repair features, prevent abuse, diagnose failures, and improve the service.",
      "Connected eBay information is used only to provide the eBay features you request, maintain or revoke the connection, enforce security controls, and comply with eBay marketplace account-deletion requirements.",
      "Advertising identifiers and related technical information may be used to deliver, measure, limit, and improve advertising where advertising is enabled.",
    ],
  },
  {
    title: "Photos and automated analysis",
    body: [
      "Photos and item details may be uploaded to secure storage and sent to service providers that perform identification, image processing, model generation, valuation research, or other requested analysis.",
      "Do not upload sensitive personal information that is unrelated to the item being analyzed.",
    ],
  },
  {
    title: "How information is shared",
    body: [
      "KeepFlip may share limited information with infrastructure, storage, authentication, analytics, artificial-intelligence, market-research, advertising, mapping, and support providers when needed to operate the app.",
      "When you use connected eBay features, information may be exchanged with eBay through eBay APIs according to the permissions you approved and the applicable eBay terms and privacy notice.",
      "Advertising partners, including Appodeal and its service partners, may process device information, IP address, advertising identifiers, consent choices, ad impressions, clicks, and approximate location when permitted.",
      "KeepFlip may also disclose information when required by law, to protect users or the service, or as part of a merger, acquisition, financing, or transfer of the business.",
    ],
  },
  {
    title: "Data retention and eBay deletion requests",
    body: [
      "KeepFlip retains account and item information while your account is active and for as long as reasonably necessary to provide the service, resolve disputes, maintain security, and comply with legal obligations.",
      "Temporary analysis files may be deleted after processing. Some backups and service-provider records may remain for a limited period where permitted by applicable requirements.",
      "When KeepFlip receives a valid eBay marketplace account-deletion notification for a connected eBay user, KeepFlip deletes the associated stored eBay connection data unless specific information must be retained for a demonstrable legal obligation.",
    ],
  },
  {
    title: "Your choices",
    body: [
      "You may choose whether to provide photos, location access, and certain device permissions. Disabling a permission may prevent the related feature from working.",
      "You may disconnect your eBay account from KeepFlip. Disconnecting stops future authenticated eBay access through that connection and initiates removal or revocation of connection credentials as supported by the service.",
      "Device advertising settings may allow you to reset or limit the use of an advertising identifier. Consent controls may also be shown where required.",
      "You may request access, correction, or deletion of eligible account information by contacting KeepFlip support.",
    ],
  },
  {
    title: "Security",
    body: [
      "KeepFlip uses reasonable administrative and technical safeguards, including Appwrite-based authentication and access controls, encrypted storage for connected eBay OAuth tokens, and integrity checks for marketplace account-deletion notifications. No storage or transmission system can be guaranteed completely secure.",
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
      effectiveDate="August 24, 2026"
      intro="This policy explains what KeepFlip collects, why it is used, and the choices available to you."
      sections={SECTIONS}
      title="Privacy Policy"
    />
  );
}
