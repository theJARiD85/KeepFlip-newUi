import { ContactPageContent } from '@/components/web/contact-page-content';
import { SiteMetadata } from '@/components/web/site-metadata';

export default function WebContactScreen() {
  return (
    <>
      <SiteMetadata
        description="Contact KeepFlip support for help with your account, item research, inventory, or marketplace listing tools. Email support@keep-flip.com."
        path="/contact"
        title="Contact KeepFlip | Product support"
      />
      <ContactPageContent />
    </>
  );
}
