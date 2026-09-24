import { AboutPageContent } from '@/components/web/about-page-content';
import { SiteMetadata } from '@/components/web/site-metadata';

export default function WebAboutScreen() {
  return (
    <>
      <SiteMetadata
        description="Learn what KeepFlip does for independent resellers, from item research and inventory tracking to marketplace listing preparation."
        path="/about"
        title="About KeepFlip | Tools for independent resellers"
      />
      <AboutPageContent />
    </>
  );
}
