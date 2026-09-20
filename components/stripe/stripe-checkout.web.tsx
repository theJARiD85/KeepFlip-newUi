import React from 'react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { View, Button, StyleSheet } from 'react-native';
import { StripeCheckoutProps } from '@/types/stripe';

// Initializing loadStripe returns a Promise containing Stripe or null
const stripePromise: Promise<Stripe | null> = loadStripe('pk_live_51Pc7h6RvtjovWZmE45BTyGTCCtJ7iZZJBCVvvAWwQ2dGzgo05KzvTt3xCl9YBxIfgEUX7akXAj7lQJLQNqBwbdR100OTG4CFOt');

function CheckoutForm({ clientSecret }: StripeCheckoutProps): React.JSX.Element {
  const stripe = useStripe();
  const elements = useElements();

  const handlePay = async (): Promise<void> => {
    if (!stripe || !elements) return;

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) return;

    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: cardElement,
      },
    });

    if (error) {
      console.error('[Stripe Error]', error.message);
    } else if (paymentIntent?.status === 'succeeded') {
      alert('Payment Successful!');
    }
  };

  return (
    <View style={styles.container}>
      {/* Stripe elements require a DOM framework on web */}
      <div style={{ padding: '10px', border: '1px solid #ccc', borderRadius: '4px', marginBottom: '15px' }}>
        <CardElement options={{ style: { base: { fontSize: '16px' } } }} />
      </div>
      <Button title="Pay Now" onPress={handlePay} />
    </View>
  );
}

export default function StripeCheckout({ clientSecret }: StripeCheckoutProps): React.JSX.Element {
  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm clientSecret={clientSecret} />
    </Elements>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, maxWidth: 400, width: '100%' },
});
