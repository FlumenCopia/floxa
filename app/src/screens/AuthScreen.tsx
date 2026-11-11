import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  ImageBackground,
} from 'react-native';
import { ArrowRight, ArrowLeft, Mail, Lock, Key, Settings, Globe } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ForgotPasswordModal } from '../components/ForgotPasswordModal';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL, setCustomApiBaseUrl } from '../services/api';
import { THEME } from '../constants/theme';

export const AuthScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { loginConsultant, loginClient, isLoading } = useAuth();
  const [stage, setStage] = useState<'splash' | 'login'>('splash');
  const [authMode, setAuthMode] = useState<'consultant' | 'client'>('consultant');

  // Consultant fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Client fields
  const [portalToken, setPortalToken] = useState('');
  const [portalEmail, setPortalEmail] = useState('');
  const [portalPassword, setPortalPassword] = useState('');
  const [needsPortalPassword, setNeedsPortalPassword] = useState(false);

  // Password Recovery modal
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // Server endpoint modal/config
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverUrl, setServerUrl] = useState(API_BASE_URL);

  const handleConsultantLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Required Fields', 'Please enter your email and password.');
      return;
    }
    try {
      await loginConsultant(email, password);
    } catch (err: any) {
      Alert.alert('Login Failed', err.message);
    }
  };

  const handleClientLogin = async () => {
    if (!portalToken.trim()) {
      Alert.alert('Portal Token Required', 'Please enter your client portal link or access token.');
      return;
    }
    if (needsPortalPassword && (!portalEmail.trim() || !portalPassword)) {
      Alert.alert('Verification Required', 'Please enter your registered client email and portal password.');
      return;
    }
    try {
      await loginClient(
        portalToken,
        portalEmail.trim() ? portalEmail : undefined,
        portalPassword || undefined
      );
    } catch (err: any) {
      if (err?.requiresPortalPassword) {
        setNeedsPortalPassword(true);
        Alert.alert(
          'Portal Password Required',
          'This portal is password protected. Enter the registered client email and portal password sent by your consultant.'
        );
        return;
      }
      Alert.alert('Client Access Failed', err.message);
    }
  };

  const handleSaveServerUrl = async () => {
    try {
      await setCustomApiBaseUrl(serverUrl);
      setShowServerConfig(false);
      Alert.alert('Server Updated', `Active API endpoint:\n${serverUrl}`);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  return (
    <ImageBackground
      source={require('../../assets/banner1.png')}
      style={styles.fullBackground}
      resizeMode="cover"
    >
      <View style={styles.ambientDarkOverlay}>
        <KeyboardAvoidingView
          style={styles.keyboardContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingTop: Math.max(insets.top, 24),
                paddingBottom: Math.max(insets.bottom, 24),
              },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {stage === 'splash' ? (
              /* ============================================================
                 STAGE 1: SPLASH VIEW (Matches Web Login.jsx Screenshot 1)
                 ============================================================ */
              <View style={styles.glassCard}>
                <View style={styles.brandLogoWrap}>
                  <Image
                    source={require('../../assets/FLOXA_log.png')}
                    style={styles.brandLogoImg}
                    resizeMode="contain"
                  />
                </View>

                <Text style={styles.brandSubtitle}>Discover Your Brand Clarity.</Text>

                <TouchableOpacity
                  style={styles.beginPillBtn}
                  onPress={() => setStage('login')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.beginPillText}>Let's Begin</Text>
                  <View style={styles.arrowCircle}>
                    <ArrowRight size={13} color="#ffffff" strokeWidth={2.5} />
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.clientPortalLink}
                  onPress={() => {
                    setAuthMode('client');
                    setStage('login');
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.clientPortalLinkText}>Client with a project portal link?</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* ============================================================
                 STAGE 2: LOGIN VIEW (Matches Web Login.jsx Screenshot 2)
                 ============================================================ */
              <View style={styles.glassCard}>
                {/* Brand Intro & Go Back */}
                <View style={styles.loginIntroSection}>
                  <Image
                    source={require('../../assets/FLOXA_log.png')}
                    style={styles.brandLogoSmall}
                    resizeMode="contain"
                  />
                  <Text style={styles.brandSubtitleSmall}>Discover Your Brand Clarity.</Text>

                  <TouchableOpacity
                    style={styles.goBackBtn}
                    onPress={() => setStage('splash')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.goBackText}>Go Back</Text>
                    <View style={styles.arrowCircle}>
                      <ArrowLeft size={13} color="#ffffff" strokeWidth={2.5} />
                    </View>
                  </TouchableOpacity>
                </View>

                {authMode === 'consultant' ? (
                  /* Consultant Credentials Form (Matches Web Login.jsx Screenshot 2) */
                  <View style={styles.formSection}>
                    {/* Input 1: Email */}
                    <View style={styles.pillInputWrap}>
                      <View style={styles.inputIconBox}>
                        <Mail size={18} color="#6b7280" strokeWidth={2} />
                      </View>
                      <TextInput
                        style={styles.pillInput}
                        placeholder="flumenx@gmail.com"
                        placeholderTextColor="#9ca3af"
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        autoComplete="username"
                      />
                    </View>

                    {/* Input 2: Password */}
                    <View style={styles.pillInputWrap}>
                      <View style={styles.inputIconBox}>
                        <Lock size={18} color="#6b7280" strokeWidth={2} />
                      </View>
                      <TextInput
                        style={styles.pillInput}
                        placeholder="Password"
                        placeholderTextColor="#9ca3af"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        autoComplete="current-password"
                      />
                    </View>

                    {/* Forgot Password Link */}
                    <View style={styles.forgotRow}>
                      <TouchableOpacity
                        onPress={() => setShowForgotPassword(true)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.forgotLink}>Forgot Password?</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Submit Button */}
                    <TouchableOpacity
                      style={[styles.getStartedBtn, isLoading && styles.btnDisabled]}
                      onPress={handleConsultantLogin}
                      disabled={isLoading}
                      activeOpacity={0.8}
                    >
                      {isLoading ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <>
                          <Text style={styles.getStartedText}>Get Started</Text>
                          <View style={styles.arrowCircle}>
                            <ArrowRight size={13} color="#ffffff" strokeWidth={2.5} />
                          </View>
                        </>
                      )}
                    </TouchableOpacity>

                    {/* Legal Notice */}
                    <Text style={styles.legalNotice}>
                      By signing in you agree to our Terms & Privacy Policy
                    </Text>

                    {/* Client switch link */}
                    <TouchableOpacity
                      style={styles.switchAuthModeBtn}
                      onPress={() => setAuthMode('client')}
                    >
                      <Text style={styles.switchAuthModeText}>
                        Client with a project portal link or token?
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  /* Client Portal Form */
                  <View style={styles.formSection}>
                    <View style={styles.pillInputWrap}>
                      <View style={styles.inputIconBox}>
                        <Key size={18} color="#6b7280" strokeWidth={2} />
                      </View>
                      <TextInput
                        style={styles.pillInput}
                        placeholder="Collaboration Link or Token"
                        placeholderTextColor="#9ca3af"
                        value={portalToken}
                        onChangeText={setPortalToken}
                        autoCapitalize="none"
                      />
                    </View>

                    {needsPortalPassword && (
                      <>
                        <View style={styles.pillInputWrap}>
                          <View style={styles.inputIconBox}>
                            <Mail size={18} color="#6b7280" strokeWidth={2} />
                          </View>
                          <TextInput
                            style={styles.pillInput}
                            placeholder="Registered Client Email"
                            placeholderTextColor="#9ca3af"
                            value={portalEmail}
                            onChangeText={setPortalEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                          />
                        </View>

                        <View style={styles.pillInputWrap}>
                          <View style={styles.inputIconBox}>
                            <Lock size={18} color="#6b7280" strokeWidth={2} />
                          </View>
                          <TextInput
                            style={styles.pillInput}
                            placeholder="Portal Password"
                            placeholderTextColor="#9ca3af"
                            value={portalPassword}
                            onChangeText={setPortalPassword}
                            secureTextEntry
                          />
                        </View>
                      </>
                    )}

                    <Text style={styles.portalHelperText}>
                      Enter the unique collaboration key provided by your brand consultant.
                    </Text>

                    <TouchableOpacity
                      style={[styles.getStartedBtn, isLoading && styles.btnDisabled]}
                      onPress={handleClientLogin}
                      disabled={isLoading}
                      activeOpacity={0.8}
                    >
                      {isLoading ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <>
                          <Text style={styles.getStartedText}>Enter Client Portal</Text>
                          <View style={styles.arrowCircle}>
                            <ArrowRight size={13} color="#ffffff" strokeWidth={2.5} />
                          </View>
                        </>
                      )}
                    </TouchableOpacity>

                    {/* Consultant switch link */}
                    <TouchableOpacity
                      style={styles.switchAuthModeBtn}
                      onPress={() => setAuthMode('consultant')}
                    >
                      <Text style={styles.switchAuthModeText}>
                        Consultant account? Sign in with email
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Server Endpoint Settings Toggle */}
                <View style={styles.serverSettingsFooter}>
                  <TouchableOpacity
                    style={styles.serverConfigToggleBtn}
                    onPress={() => setShowServerConfig(!showServerConfig)}
                  >
                    <Settings size={13} color={THEME.textMuted} strokeWidth={2} />
                    <Text style={styles.serverConfigToggleText}>
                      {showServerConfig ? 'Hide Endpoint Settings' : 'Configure Server Endpoint'}
                    </Text>
                  </TouchableOpacity>

                  {showServerConfig && (
                    <View style={styles.serverConfigBox}>
                      <Text style={styles.serverConfigLabel}>Backend API URL:</Text>
                      <TextInput
                        style={styles.serverConfigInput}
                        value={serverUrl}
                        onChangeText={setServerUrl}
                        autoCapitalize="none"
                      />
                      <TouchableOpacity
                        style={styles.serverSaveBtn}
                        onPress={handleSaveServerUrl}
                      >
                        <Text style={styles.serverSaveBtnText}>Save Endpoint</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Password Recovery Modal */}
        <ForgotPasswordModal
          visible={showForgotPassword}
          onClose={() => setShowForgotPassword(false)}
        />
      </View>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  fullBackground: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#000704',
  },
  ambientDarkOverlay: {
    flex: 1,
    backgroundColor: THEME.ambientOverlay,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 36,
  },
  glassCard: {
    backgroundColor: THEME.bgCard,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderTopColor: THEME.borderGlassTop,
    borderBottomColor: THEME.borderGlassBottom,
    borderRadius: 40,
    paddingHorizontal: 28,
    paddingVertical: 38,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 28 },
    shadowOpacity: 0.75,
    shadowRadius: 40,
    elevation: 14,
    alignItems: 'center',
  },
  brandLogoWrap: {
    alignItems: 'center',
    marginBottom: 8,
  },
  brandLogoImg: {
    width: 250,
    height: 75,
  },
  brandLogoSmall: {
    width: 170,
    height: 52,
  },
  brandSubtitle: {
    color: '#e8f5ef',
    fontSize: 16,
    fontWeight: '400',
    letterSpacing: 0.4,
    marginBottom: 36,
    textAlign: 'center',
  },
  brandSubtitleSmall: {
    color: '#e8f5ef',
    fontSize: 14,
    fontWeight: '400',
    letterSpacing: 0.3,
    marginTop: 4,
    marginBottom: 16,
    textAlign: 'center',
  },
  beginPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    height: 54,
    paddingHorizontal: 38,
    borderRadius: 999,
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    borderTopColor: 'rgba(255, 255, 255, 0.45)',
    backgroundColor: 'rgba(14, 42, 30, 0.92)',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 8,
  },
  beginPillText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  arrowCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientPortalLink: {
    marginTop: 32,
    paddingVertical: 6,
  },
  clientPortalLinkText: {
    color: THEME.textMuted,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  loginIntroSection: {
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
  },
  goBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 38,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginTop: 4,
  },
  goBackText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
  },
  modeToggleRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 20,
    width: '100%',
  },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 999,
  },
  modeTabActive: {
    backgroundColor: 'rgba(77, 255, 160, 0.18)',
    borderWidth: 1,
    borderColor: THEME.neon,
  },
  modeTabText: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  modeTabTextActive: {
    color: THEME.neon,
    fontWeight: '700',
  },
  formSection: {
    width: '100%',
  },
  pillInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 999,
    height: 52,
    paddingHorizontal: 20,
    marginBottom: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 3,
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
  forgotRow: {
    alignItems: 'flex-end',
    marginBottom: 16,
    marginTop: -2,
    paddingRight: 4,
  },
  forgotLink: {
    color: '#89aca0',
    fontSize: 12,
    fontWeight: '500',
  },
  portalHelperText: {
    color: '#89aca0',
    fontSize: 12,
    marginBottom: 16,
    lineHeight: 16,
    paddingHorizontal: 6,
  },
  getStartedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    height: 52,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    backgroundColor: 'rgba(14, 42, 30, 0.95)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    width: '100%',
  },
  getStartedText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  legalNotice: {
    color: '#64748b',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 15,
  },
  switchAuthModeBtn: {
    marginTop: 16,
    paddingVertical: 6,
    alignItems: 'center',
  },
  switchAuthModeText: {
    color: THEME.textMuted,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  serverSettingsFooter: {
    marginTop: 22,
    width: '100%',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 14,
  },
  serverConfigToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  serverConfigToggleText: {
    color: THEME.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  serverConfigBox: {
    width: '100%',
    backgroundColor: '#020806',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    marginTop: 10,
  },
  serverConfigLabel: {
    color: THEME.textMuted,
    fontSize: 11,
    marginBottom: 4,
  },
  serverConfigInput: {
    backgroundColor: '#000704',
    borderWidth: 1,
    borderColor: THEME.borderLight,
    borderRadius: 6,
    color: THEME.text,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
  },
  serverSaveBtn: {
    backgroundColor: 'rgba(77, 255, 160, 0.15)',
    borderWidth: 1,
    borderColor: THEME.neon,
    borderRadius: 6,
    paddingVertical: 6,
    alignItems: 'center',
    marginTop: 8,
  },
  serverSaveBtnText: {
    color: THEME.neon,
    fontSize: 12,
    fontWeight: '700',
  },
});
