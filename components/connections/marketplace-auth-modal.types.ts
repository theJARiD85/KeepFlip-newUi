import type {
  CrosslistingMarketplace,
  CrosslistingPayload,
} from '@/services/crosslisting-service';

export type MarketplaceAuthModalProps = {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
  onPrepared?: () => void;
  onSubmitPressed?: () => void;
  onConfirmed?: (externalUrl?: string) => void;
  onNext?: () => void;
  nextLabel?: string;
  progressLabel?: string;
  userId: string;
  platform: CrosslistingMarketplace;
  payload: CrosslistingPayload;
  photoFileIds: string[];
  photoBucketId?: string;
};
