import TermsScreen from '@/components/legal/terms-of-service-page';
import { SiteMetadata } from '@/components/web/site-metadata';

export default function WebTermsScreen() {
  return (
    <>
      <SiteMetadata
        description="Read the KeepFlip Terms of Service for rules on accounts, item analysis, resale estimates, marketplace activity, subscriptions, and third-party services."
        path="/terms"
        title="KeepFlip Terms of Service | Use and estimates"
      />
      <TermsScreen />
    </>
  );
}
