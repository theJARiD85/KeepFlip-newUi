import { Redirect } from 'expo-router';

export default function AnalyticsRoute() {
  return <Redirect href="/inventory?tab=analytics" />;
}
