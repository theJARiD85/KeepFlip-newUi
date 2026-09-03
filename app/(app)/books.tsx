import { useLocalSearchParams } from 'expo-router';

import { BooksReviewScreen } from '@/components/books/books-review-screen';
import { BooksScreen } from '@/components/books/books-screen';

export default function BooksRoute() {
  const params = useLocalSearchParams<{ reviewId?: string | string[] }>();
  const value = Array.isArray(params.reviewId) ? params.reviewId[0] : params.reviewId;
  const reviewId = typeof value === 'string' ? value.trim() : '';

  return reviewId ? <BooksReviewScreen reviewId={reviewId} /> : <BooksScreen />;
}
