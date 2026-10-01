import type {
  CrosslistingMarketplace,
  CrosslistingPayload,
} from '@/services/crosslisting-service';

export type MarketplaceAuthModalProps = {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
  userId: string;
  platform: CrosslistingMarketplace;
  payload: CrosslistingPayload;
};
