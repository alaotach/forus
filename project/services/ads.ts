/**
 * Ads Service
 * Manages ad display logic for free plan users
 */

import { SubscriptionData, shouldShowAds } from './subscriptions';

export interface AdDisplayConfig {
  showAds: boolean;
  frequency: 'always' | 'sometimes' | 'rarely'; // How often to show
}

/**
 * Determine if ads should be shown based on subscription
 */
export function getAdConfig(subscription: SubscriptionData | null): AdDisplayConfig {
  const shouldShow = shouldShowAds(subscription);
  
  return {
    showAds: shouldShow,
    frequency: shouldShow ? 'always' : 'never' as any,
  };
}

/**
 * Sample ad data - can be replaced with real ads from a provider
 */
export const SAMPLE_ADS = [
  {
    id: 'ad-1',
    title: '💎 Go Premium',
    message: 'Remove ads and unlock unlimited storage',
    cta: 'Upgrade Now',
  },
  {
    id: 'ad-2',
    title: '✨ Enhanced Features',
    message: 'Premium members get priority support and more storage',
    cta: 'Learn More',
  },
  {
    id: 'ad-3',
    title: '🎁 Lifetime Plan',
    message: 'One-time payment for lifetime premium access',
    cta: 'Get Lifetime',
  },
];

/**
 * Get a random ad to display
 */
export function getRandomAd() {
  return SAMPLE_ADS[Math.floor(Math.random() * SAMPLE_ADS.length)];
}
