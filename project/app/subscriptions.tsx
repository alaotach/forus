import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Check, X, Crown, Zap, RefreshCw } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useCouple } from '@/hooks/useCouple';
import {
  SUBSCRIPTION_FEATURES,
  SubscriptionType,
  createOrUpdateSubscription,
  getSubscription,
  isSubscriptionActive,
} from '@/services/subscriptions';
import { purchaseSubscription, restorePurchases, getProductDetails, IAPProduct, initializeIAP } from '@/services/iap';

export default function SubscriptionsScreen() {
  const router = useRouter();
  const { coupleData } = useCouple();
  const [currentSubscription, setCurrentSubscription] = useState<SubscriptionType>('free');
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionType | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [productDetails, setProductDetails] = useState<{ [key: string]: IAPProduct | null }>({});
  const [isInitializing, setIsInitializing] = useState(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    initializeApp();

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const initializeApp = async () => {
    try {
      setIsInitializing(true);
      
      // Initialize IAP
      await initializeIAP();
      
      // Load subscription
      if (coupleData) {
        await loadSubscription();
        
        // Load product details for all plans
        const details: { [key: string]: IAPProduct | null } = {};
        for (const plan of ['monthly', 'yearly', 'lifetime'] as SubscriptionType[]) {
          const product = await getProductDetails(plan);
          details[plan] = product;
        }
        setProductDetails(details);
      }
    } catch (error) {
      console.error('Error initializing app:', error);
    } finally {
      setIsInitializing(false);
    }
  };

  const loadSubscription = async () => {
    if (!coupleData) return;
    
    const subscription = await getSubscription(coupleData.coupleCode);
    if (subscription) {
      setCurrentSubscription(subscription.type);
    }
  };

  const handleUpgrade = (plan: SubscriptionType) => {
    if (plan === currentSubscription) {
      Alert.alert('Already Subscribed', 'You are already on this plan');
      return;
    }
    
    setSelectedPlan(plan);
    setShowPaymentModal(true);
  };

  const processPayment = async () => {
    if (!selectedPlan || !coupleData) return;

    setIsProcessing(true);
    try {
      const transaction = await purchaseSubscription(selectedPlan);      
      if (transaction) {
        await createOrUpdateSubscription(coupleData.coupleCode, selectedPlan);
        
        setCurrentSubscription(selectedPlan);
        setShowPaymentModal(false);
        
        const planName = selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1);
        Alert.alert(
          'Success! 🎉',
          `You have been upgraded to ${planName} plan! Both you and your partner can now enjoy all premium features together.`,
          [{ text: 'Done', onPress: () => router.back() }]
        );
      } else {
        Alert.alert('Purchase Cancelled', 'The purchase was cancelled.');
      }
    } catch (error) {
      console.error('Purchase error:', error);
      Alert.alert(
        'Payment Failed',
        'Unable to process payment. Please check your internet connection and try again.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestorePurchases = async () => {
    try {
      setIsProcessing(true);
      const purchases = await restorePurchases();
      
      if (purchases.length > 0) {
        Alert.alert('Success', 'Your previous purchases have been restored!');
        await loadSubscription();
      } else {
        Alert.alert('No Purchases Found', 'No previous purchases were found to restore.');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to restore purchases. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const planCards = (['free', 'monthly', 'yearly', 'lifetime'] as SubscriptionType[]).map((plan) => {
    const features = SUBSCRIPTION_FEATURES[plan];
    const isCurrentPlan = plan === currentSubscription;
    
    return (
      <Animated.View
        key={plan}
        style={{
          opacity: fadeAnim,
          transform: [{ scale: fadeAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.9, 1],
          })}],
        }}
      >
        <LinearGradient
          colors={isCurrentPlan 
            ? ['#667eea', '#764ba2'] 
            : plan === 'lifetime'
            ? ['#f093fb', '#f5576c']
            : ['#ffffff', '#f8f9fa']}
          style={[
            styles.planCard,
            isCurrentPlan && styles.activePlan,
            plan === 'lifetime' && styles.premiumPlan,
          ]}
        >
          <View style={styles.planHeader}>
            {plan === 'lifetime' && (
              <Crown size={24} color={isCurrentPlan ? '#fff' : '#f5576c'} style={{ marginRight: 8 }} />
            )}
            <Text style={[
              styles.planName,
              isCurrentPlan && styles.planNameActive,
              plan === 'lifetime' && !isCurrentPlan && { color: '#f5576c' },
            ]}>
              {plan.charAt(0).toUpperCase() + plan.slice(1)}
            </Text>
            {isCurrentPlan && (
              <View style={styles.activeBadge}>
                <Check size={14} color="#fff" />
              </View>
            )}
          </View>

          <Text style={[
            styles.price,
            isCurrentPlan && styles.priceActive,
          ]}>
            ${features.price.toFixed(2)}
            {plan !== 'lifetime' && <Text style={styles.priceUnit}>/month</Text>}
          </Text>

          <View style={styles.featuresList}>
            {features.features.map((feature, idx) => (
              <View key={idx} style={styles.featureItem}>
                <Check
                  size={16}
                  color={isCurrentPlan ? '#fff' : '#667eea'}
                  style={{ marginRight: 8 }}
                />
                <Text style={[
                  styles.featureText,
                  isCurrentPlan && styles.featureTextActive,
                ]}>
                  {feature}
                </Text>
              </View>
            ))}
          </View>

          {!isCurrentPlan && (
            <TouchableOpacity
              style={[
                styles.upgradeButton,
                plan === 'lifetime' && styles.upgradeButtonPremium,
              ]}
              onPress={() => handleUpgrade(plan)}
            >
              <Text style={styles.upgradeButtonText}>
                {plan === 'free' ? 'Current Plan' : 'Upgrade'}
              </Text>
            </TouchableOpacity>
          )}
        </LinearGradient>
      </Animated.View>
    );
  });

  return (
    <LinearGradient colors={['#f5f7fa', '#e8eef5']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.title}>Upgrade Your Plan</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.subtitle}>
            Subscriptions are for your couple - only one of you needs to purchase
          </Text>

          <View style={styles.coupleInfoBox}>
            <Text style={styles.coupleInfoText}>
              💑 Once someone upgrades, both of you will enjoy all premium benefits together
            </Text>
          </View>

          <View style={styles.plansContainer}>
            {planCards}
          </View>

          <View style={styles.comparisonTable}>
            <Text style={styles.comparisonTitle}>Feature Comparison</Text>
            
            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonLabel}>Storage</Text>
              {(['free', 'monthly', 'yearly', 'lifetime'] as SubscriptionType[]).map(plan => (
                <Text key={plan} style={styles.comparisonValue}>
                  {SUBSCRIPTION_FEATURES[plan].storageQuotaMB}MB
                </Text>
              ))}
            </View>

            <View style={styles.comparisonRow}>
              <Text style={styles.comparisonLabel}>Vault Retention</Text>
              {(['free', 'monthly', 'yearly', 'lifetime'] as SubscriptionType[]).map(plan => (
                <Text key={plan} style={styles.comparisonValue}>
                  {SUBSCRIPTION_FEATURES[plan].retentionDaysFreeItems < 0 ? '∞' : `${SUBSCRIPTION_FEATURES[plan].retentionDaysFreeItems}d`}
                </Text>
              ))}
            </View>
          </View>

          <TouchableOpacity 
            style={styles.restoreButton}
            onPress={handleRestorePurchases}
            disabled={isProcessing}
          >
            <RefreshCw size={16} color="#667eea" />
            <Text style={styles.restoreButtonText}>Restore Previous Purchases</Text>
          </TouchableOpacity>
        </ScrollView>

        <Modal
          visible={showPaymentModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowPaymentModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                Upgrade to {selectedPlan?.toUpperCase()} Plan
              </Text>
              <Text style={styles.modalPrice}>
                ${selectedPlan ? SUBSCRIPTION_FEATURES[selectedPlan].price.toFixed(2) : '0.00'}
                {selectedPlan !== 'lifetime' && ' per month'}
              </Text>

              <TouchableOpacity
                style={styles.confirmButton}
                disabled={isProcessing}
                onPress={processPayment}
              >
                <Text style={styles.confirmButtonText}>
                  {isProcessing ? 'Processing...' : 'Complete Purchase'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowPaymentModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontFamily: 'Playfair-Bold',
    color: '#333',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
  },
  coupleInfoBox: {
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    borderLeftWidth: 4,
    borderLeftColor: '#667eea',
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
  },
  coupleInfoText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: '#667eea',
  },
  plansContainer: {
    gap: 16,
    marginBottom: 32,
  },
  planCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
  },
  activePlan: {
    borderWidth: 2,
    borderColor: '#667eea',
  },
  premiumPlan: {
    borderWidth: 2,
    borderColor: '#f5576c',
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  planName: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: '#333',
    flex: 1,
  },
  planNameActive: {
    color: '#fff',
  },
  activeBadge: {
    backgroundColor: '#667eea',
    borderRadius: 20,
    padding: 6,
  },
  price: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    color: '#667eea',
    marginBottom: 16,
  },
  priceActive: {
    color: '#fff',
  },
  priceUnit: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  featuresList: {
    gap: 12,
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#666',
    flex: 1,
  },
  featureTextActive: {
    color: '#fff',
  },
  upgradeButton: {
    backgroundColor: '#667eea',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  upgradeButtonPremium: {
    backgroundColor: '#f5576c',
  },
  upgradeButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#fff',
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#667eea',
    borderRadius: 12,
    gap: 8,
  },
  restoreButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#667eea',
  },
  comparisonTable: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 32,
  },
  comparisonTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#333',
    marginBottom: 16,
  },
  comparisonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  comparisonLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#666',
    flex: 1,
  },
  comparisonValue: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#333',
    flex: 0.8,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    minHeight: 280,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: '#333',
    marginBottom: 8,
  },
  modalPrice: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    color: '#667eea',
    marginBottom: 24,
  },
  confirmButton: {
    backgroundColor: '#667eea',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  confirmButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#fff',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#333',
  },
});
