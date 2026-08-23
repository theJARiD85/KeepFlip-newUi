import * as Linking from 'expo-linking';

const SUPPORT_EMAIL = 'support@keep-flip.com';
const GOOGLE_PLAY_PACKAGE_ID = 'com.keepflip.app';

export type IncorrectIdentificationReport = {
  identifiedAs: string;
  itemId?: string | null;
  scanId?: string | null;
};

function mailtoUrl(subject: string, body: string) {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const feedbackEmailUrl = mailtoUrl(
  'KeepFlip feedback',
  [
    'What were you trying to do?',
    '',
    'What worked well?',
    '',
    'What should KeepFlip do better?',
  ].join('\n'),
);

const googlePlayReviewUrl = `market://details?id=${GOOGLE_PLAY_PACKAGE_ID}&showAllReviews=true`;
const googlePlayFallbackUrl = `https://play.google.com/store/apps/details?id=${GOOGLE_PLAY_PACKAGE_ID}&showAllReviews=true`;

export function keepFlipFeedbackEmailAddress() {
  return SUPPORT_EMAIL;
}

export async function openKeepFlipFeedbackEmail() {
  await Linking.openURL(feedbackEmailUrl);
}

export async function openKeepFlipSupportEmail() {
  await Linking.openURL(
    `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('KeepFlip support and feedback')}`,
  );
}

export async function openKeepFlipIncorrectIdentificationReport({
  identifiedAs,
  itemId,
  scanId,
}: IncorrectIdentificationReport) {
  const references = [
    itemId ? `Saved item ID: ${itemId}` : null,
    scanId ? `Scan ID: ${scanId}` : null,
  ].filter((value): value is string => Boolean(value));

  await Linking.openURL(
    mailtoUrl(
      'KeepFlip report: incorrect identification',
      [
        'KeepFlip identified this result incorrectly.',
        '',
        `Identified as: ${identifiedAs || 'Unknown item'}`,
        ...references,
        '',
        'What is this item actually?',
        '',
        'What led you to that conclusion? Add a brand, model, label, or other clue if you have one.',
      ].join('\n'),
    ),
  );
}

export async function openKeepFlipGooglePlayReviews() {
  try {
    await Linking.openURL(googlePlayReviewUrl);
  } catch {
    await Linking.openURL(googlePlayFallbackUrl);
  }
}
