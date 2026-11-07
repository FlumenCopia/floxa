import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Mail, ArrowRight, ArrowLeft, CheckCircle2, KeyRound, X } from 'lucide-react-native';
import { api } from '../services/api';
import { THEME } from '../constants/theme';

interface ForgotPasswordModalProps {
  visible: boolean;
  onClose: () => void;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({ visible, onClose }) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async () => {
    setErrorMessage('');
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setErrorMessage('Please enter your account email address.');
      return;
    }

    setIsLoading(true);
    try {
      await api.post('/auth/forgot-password/', { email: cleanEmail });
      setIsSubmitted(true);
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Failed to dispatch reset link.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetState = () => {
    setIsSubmitted(false);
    setEmail('');
    setErrorMessage('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={handleResetState}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {/* Header Close */}
          <TouchableOpacity style={styles.closeBtn} onPress={handleResetState} activeOpacity={0.8}>
            <X size={16} color={THEME.textMuted} strokeWidth={2.4} />
          </TouchableOpacity>

          {/* Badge */}
          <View style={styles.badgeRow}>
            <KeyRound size={13} color={THEME.neon} strokeWidth={2.4} />
            <Text style={styles.badgeText}>Password Recovery</Text>
          </View>

          {isSubmitted ? (
            /* Success State (Matches Web Page) */
            <View style={styles.successBox}>
              <View style={styles.iconCircle}>
                <CheckCircle2 size={36} color={THEME.neon} strokeWidth={2.2} />
              </View>

              <Text style={styles.title}>Reset Link Dispatched</Text>
              <Text style={styles.subtitle}>
                If an account exists for {email}, a secure password reset link has been dispatched to your inbox.
              </Text>
              <Text style={styles.noticeText}>
                Please check your inbox (and spam folder). The reset link expires in 30 minutes.
              </Text>

              <TouchableOpacity style={styles.submitBtn} onPress={handleResetState} activeOpacity={0.8}>
                <Text style={styles.submitBtnText}>Return to Login</Text>
                <View style={styles.arrowCircle}>
                  <ArrowRight size={13} color="#000704" strokeWidth={2.6} />
                </View>
              </TouchableOpacity>
            </View>
          ) : (
            /* Form State */
            <View style={styles.formBox}>
              <Text style={styles.title}>Reset Password</Text>
              <Text style={styles.subtitle}>
                Enter your account email address and we will dispatch a secure link to reset your credentials.
              </Text>

              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

              <View style={styles.pillInputWrap}>
                <View style={styles.inputIconBox}>
                  <Mail size={18} color="#6b7280" strokeWidth={2} />
                </View>
                <TextInput
                  style={styles.pillInput}
                  placeholder="name@company.com"
                  placeholderTextColor="#9ca3af"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoFocus
                />
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, isLoading && styles.btnDisabled]}
                onPress={handleSubmit}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <ActivityIndicator color="#000704" />
                ) : (
                  <>
                    <Text style={styles.submitBtnText}>Send Recovery Link</Text>
                    <View style={styles.arrowCircle}>
                      <ArrowRight size={13} color="#000704" strokeWidth={2.6} />
                    </View>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.backBtn} onPress={handleResetState} activeOpacity={0.8}>
                <ArrowLeft size={13} color={THEME.textMuted} strokeWidth={2.2} />
                <Text style={styles.backBtnText}>Back to Sign In</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#020806',
    borderWidth: 1,
    borderColor: 'rgba(77, 255, 160, 0.28)',
    borderRadius: 28,
    padding: 26,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.6,
    shadowRadius: 30,
  },
  closeBtn: {
    position: 'absolute',
    top: 18,
    right: 18,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(77, 255, 160, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(77, 255, 160, 0.3)',
    marginBottom: 14,
  },
  badgeText: {
    color: THEME.neon,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: THEME.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  noticeText: {
    color: '#89aca0',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 22,
  },
  formBox: {
    width: '100%',
    alignItems: 'center',
  },
  successBox: {
    width: '100%',
    alignItems: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(77, 255, 160, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(77, 255, 160, 0.3)',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 12,
    marginBottom: 12,
    textAlign: 'center',
  },
  pillInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 999,
    height: 52,
    paddingHorizontal: 18,
    marginBottom: 18,
    width: '100%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  inputIconBox: {
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillInput: {
    flex: 1,
    color: '#111827',
    fontSize: 15,
    fontWeight: '500',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 50,
    borderRadius: 999,
    backgroundColor: THEME.neon,
    width: '100%',
  },
  submitBtnText: {
    color: '#000704',
    fontSize: 15,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  arrowCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 7, 4, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 6,
  },
  backBtnText: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
});

