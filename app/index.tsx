import { Redirect } from 'expo-router';

export default function NativeHomeScreen() {
  return <Redirect href="/auth-check" />;
}
