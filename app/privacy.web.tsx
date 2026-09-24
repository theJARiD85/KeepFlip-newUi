import PrivacyScreen from '@/components/legal/privacy-policy-page';
import { SiteMetadata } from '@/components/web/site-metadata';

export default function WebPrivacyScreen() {
  return (
    <>
      <SiteMetadata
        description="Read the KeepFlip Privacy Policy to learn what account, item, location, marketplace, bank, and device information may be collected and how to contact support."
        path="/privacy"
        title="KeepFlip Privacy Policy | Data and choices"
      />
      <PrivacyScreen />
    </>
  );
}
