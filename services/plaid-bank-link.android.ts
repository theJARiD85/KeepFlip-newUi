import {
  createPlaidLinkSession,
  type LinkExit,
  type LinkSuccess,
} from 'react-native-plaid-link-sdk';

import {
  createPlaidLinkToken,
  exchangePlaidPublicToken,
  syncPlaidBankTransactions,
  type PlaidBankLinkResult,
} from '@/services/plaid-bank-service';

function safeAccounts(success: LinkSuccess) {
  return success.metadata.accounts.slice(0, 50).map((account) => ({
    id: account.id,
    mask: account.mask ?? null,
    name: account.name ?? null,
    subtype:
      (account.subtype as { subtype?: string } | undefined)?.subtype ?? null,
    type: account.type ?? null,
  }));
}

function exitMessage(exit: LinkExit) {
  return (
    exit.error?.displayMessage ||
    exit.error?.errorMessage ||
    'Bank linking was cancelled before the account was connected.'
  );
}

export async function linkPlaidBankAccount(): Promise<PlaidBankLinkResult> {
  const { linkToken } = await createPlaidLinkToken('android');

  return new Promise<PlaidBankLinkResult>((resolve, reject) => {
    let settled = false;
    let successStarted = false;

    const finishError = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error('KeepFlip could not link that bank account.'));
    };

    const finishSuccess = (result: PlaidBankLinkResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    void createPlaidLinkSession({
      onEvent: () => undefined,
      onExit: (exit) => {
        if (successStarted) return;
        finishError(new Error(exitMessage(exit)));
      },
      onSuccess: (success) => {
        successStarted = true;
        void exchangePlaidPublicToken({
          accounts: safeAccounts(success),
          institution: success.metadata.institution
            ? {
                id: success.metadata.institution.id,
                name: success.metadata.institution.name,
              }
            : null,
          publicToken: success.publicToken,
        })
          .then(async (connection) => ({
            connection,
            sync: await syncPlaidBankTransactions(connection.connectionId),
          }))
          .then(finishSuccess)
          .catch(finishError);
      },
      token: linkToken,
    })
      .then((session) => session.open())
      .catch(finishError);
  });
}
