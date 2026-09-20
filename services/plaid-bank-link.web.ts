import type { PlaidBankLinkResult } from './plaid-bank-link.native';

export async function linkPlaidBankAccount(): Promise<PlaidBankLinkResult> {
  throw new Error(
    'Bank linking needs the KeepFlip Android or iOS development/release build; Expo Go and the browser cannot load Plaid Link.',
  );
}
