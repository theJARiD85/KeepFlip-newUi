import type { PlaidBankLinkResult } from '@/services/plaid-bank-service';

type PlaidBankLinkButtonProps = {
  busy: boolean;
  disabled?: boolean;
  fontSize: number;
  onBusyChange: (busy: boolean) => void;
  onError: (message: string | null) => void;
  onLinked: (result: PlaidBankLinkResult) => void;
  onStart: () => void;
};

export function PlaidBankLinkButton(_props: PlaidBankLinkButtonProps) {
  return null;
}
