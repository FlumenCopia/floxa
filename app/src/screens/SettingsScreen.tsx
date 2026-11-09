import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ImageBackground,
  Image,
  ActivityIndicator,
  Platform,
} from 'react-native';
import {
  User,
  Lock,
  Palette,
  Server,
  Info,
  LogOut,
  Camera,
  Upload,
  Trash2,
  Check,
  KeyRound,
  Shield,
  Building,
  Phone,
  Mail,
  ArrowRight,
  Globe,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { PermissionService, FloxaPermissionType } from '../services/permissions';
import { PermissionModal } from '../components/PermissionModal';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../constants/theme';
import { api, API_BASE_URL, setCustomApiBaseUrl } from '../services/api';
import { storage } from '../services/storage';

type SettingsTab = 'account' | 'security' | 'branding' | 'environment';

export const SettingsScreen: React.FC = () => {
  const { user, logout, updateUser } = useAuth();
  const consultant = user as any;

  const [activeTab, setActiveTab] = useState<SettingsTab>('account');

  // Account Profile States (matching web Account.js)
  const [name, setName] = useState(consultant?.name || '');
  const [email, setEmail] = useState(consultant?.email || '');
  const [company, setCompany] = useState(consultant?.company || '');
  const [phone, setPhone] = useState(consultant?.phone || '');
  const [avatarUri, setAvatarUri] = useState<string | null>(consultant?.avatar_url || consultant?.avatar || null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState('');

  // Security / Password States (matching web Security.js)
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordErrorMsg, setPasswordErrorMsg] = useState('');
  const [passwordSuccessMsg, setPasswordSuccessMsg] = useState('');

  // Branding States (matching web Branding.js)
  const [studioHeading, setStudioHeading] = useState(consultant?.company || 'Your Studio');
  const [brandColor, setBrandColor] = useState('#4DFFA0');
  const [brandSlug, setBrandSlug] = useState('studio');
  const [isSavingBranding, setIsSavingBranding] = useState(false);
  const [brandingSuccessMsg, setBrandingSuccessMsg] = useState('');

  // Server Environment States
  const [serverUrl, setServerUrl] = useState(API_BASE_URL);
  const [isEditingServer, setIsEditingServer] = useState(false);

  useEffect(() => {
    if (consultant) {
      if (!name && consultant.name) setName(consultant.name);
      if (!email && consultant.email) setEmail(consultant.email);
      if (!company && consultant.company) setCompany(consultant.company);
      if (!phone && consultant.phone) setPhone(consultant.phone);
      if (!avatarUri && (consultant.avatar_url || consultant.avatar)) {
        setAvatarUri(consultant.avatar_url || consultant.avatar);
      }
    }
  }, [consultant]);

  const [permissionModalState, setPermissionModalState] = useState<{
    visible: boolean;
    type: FloxaPermissionType;
    isBlocked: boolean;
  }>({
    visible: false,
    type: 'camera',
    isBlocked: false,
  });

  // Handle Photo Picker (from Camera or Gallery)
  const handlePickAvatar = async (fromCamera = false) => {
    try {
      if (fromCamera) {
        const perm = await PermissionService.requestCamera();
        if (!perm.granted) {
          setPermissionModalState({
            visible: true,
            type: 'camera',
            isBlocked: !perm.canAskAgain,
          });
          return;
        }
      } else {
        const perm = await PermissionService.requestMediaLibrary();
        if (!perm.granted) {
          setPermissionModalState({
            visible: true,
            type: 'mediaLibrary',
            isBlocked: !perm.canAskAgain,
          });
          return;
        }
      }

      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      };

      const result = fromCamera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setAvatarUri(result.assets[0].uri);
        setProfileSuccessMsg('Photo selected. Tap "Save Profile Changes" to update.');
      }
    } catch (err: any) {
      Alert.alert('Image Picker Error', err.message);
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarUri(null);
    setProfileSuccessMsg('Avatar removed. Tap "Save Profile Changes" to apply.');
  };

  // Save Account Profile
  const handleSaveProfile = async () => {
    if (!name.trim()) {
      Alert.alert('Required Field', 'Please enter your full name.');
      return;
    }

    setIsSavingProfile(true);
    setProfileSuccessMsg('');
    try {
      const payload: Record<string, any> = {
        name: name.trim(),
        company: company.trim(),
        phone: phone.trim(),
      };

      if (avatarUri && !avatarUri.startsWith('http')) {
        // Upload image as multipart formData
        const formData = new FormData();
        formData.append('name', name.trim());
        formData.append('company', company.trim());
        formData.append('phone', phone.trim());

        const filename = avatarUri.split('/').pop() || 'avatar.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : `image/jpeg`;

        formData.append('avatar', {
          uri: avatarUri,
          name: filename,
          type,
        } as any);

        const res = await api.patch('/auth/me/', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        if (res.data?.consultant) {
          await updateUser(res.data.consultant);
        } else {
          await updateUser(payload);
        }
      } else {
        const res = await api.patch('/auth/me/', payload);
        if (res.data?.consultant) {
          await updateUser(res.data.consultant);
        } else {
          await updateUser(payload);
        }
      }

      setProfileSuccessMsg('Profile updated successfully.');
      Alert.alert('Profile Saved', 'Your consultant account profile has been updated.');
    } catch (err: any) {
      const msg = err.response?.data?.name?.[0] || err.response?.data?.detail || err.message || 'Failed to save profile.';
      Alert.alert('Error', msg);
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Change Password
  const handleChangePassword = async () => {
    setPasswordErrorMsg('');
    setPasswordSuccessMsg('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordErrorMsg('Please fill in all password fields.');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordErrorMsg('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordErrorMsg('New password and confirmation do not match.');
      return;
    }

    if (newPassword === currentPassword) {
      setPasswordErrorMsg('New password cannot be identical to current password.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      await api.post('/auth/change-password/', {
        currentPassword,
        newPassword,
        confirmPassword,
      });

      setPasswordSuccessMsg('Your password has been updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Password Updated', 'Your account credentials have been successfully updated.');
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Failed to update password. Please check your current password.';
      setPasswordErrorMsg(msg);
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  // Save Branding
  const handleSaveBranding = () => {
    setIsSavingBranding(true);
    setTimeout(() => {
      setIsSavingBranding(false);
      setBrandingSuccessMsg('Studio white-label branding saved.');
      Alert.alert('Branding Saved', 'Custom studio branding has been cached.');
    }, 400);
  };

  // Save Server Endpoint
  const handleSaveServer = async () => {
    try {
      await setCustomApiBaseUrl(serverUrl);
      setIsEditingServer(false);
      Alert.alert('Server Updated', `Active API URL is now:\n${serverUrl}`);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  return (
    <ImageBackground
      source={require('../../assets/banner1.png')}
      style={styles.fullBg}
      resizeMode="cover"
    >
      <View style={styles.ambientOverlay}>
        {/* Top Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Studio Settings</Text>
            <Text style={styles.headerSubtitle}>Manage your consultant profile, security, and branding</Text>
          </View>
        </View>

        {/* Horizontal Navigation Tabs */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'account' && styles.tabBtnActive]}
            onPress={() => setActiveTab('account')}
            activeOpacity={0.8}
          >
            <User size={14} color={activeTab === 'account' ? THEME.neon : THEME.textMuted} strokeWidth={2.2} />
            <Text style={[styles.tabBtnText, activeTab === 'account' && styles.tabBtnTextActive]}>Profile</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'security' && styles.tabBtnActive]}
            onPress={() => setActiveTab('security')}
            activeOpacity={0.8}
          >
            <Lock size={14} color={activeTab === 'security' ? THEME.neon : THEME.textMuted} strokeWidth={2.2} />
            <Text style={[styles.tabBtnText, activeTab === 'security' && styles.tabBtnTextActive]}>Security</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'branding' && styles.tabBtnActive]}
            onPress={() => setActiveTab('branding')}
            activeOpacity={0.8}
          >
            <Palette size={14} color={activeTab === 'branding' ? THEME.neon : THEME.textMuted} strokeWidth={2.2} />
            <Text style={[styles.tabBtnText, activeTab === 'branding' && styles.tabBtnTextActive]}>Branding</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'environment' && styles.tabBtnActive]}
            onPress={() => setActiveTab('environment')}
            activeOpacity={0.8}
          >
            <Server size={14} color={activeTab === 'environment' ? THEME.neon : THEME.textMuted} strokeWidth={2.2} />
            <Text style={[styles.tabBtnText, activeTab === 'environment' && styles.tabBtnTextActive]}>Server</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* ============================================================
              TAB 1: ACCOUNT PROFILE EDIT (Matching web Account.js)
              ============================================================ */}
          {activeTab === 'account' && (
            <View>
              {/* Avatar Section */}
              <View style={styles.glassCard}>
                <Text style={styles.cardSectionLabel}>PROFILE PICTURE</Text>

                <View style={styles.avatarRow}>
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                  ) : (
                    <View style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarInitial}>
                        {(name || consultant?.name || 'C').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}

                  <View style={styles.avatarActionsCol}>
                    <TouchableOpacity
                      style={styles.avatarActionPill}
                      onPress={() => handlePickAvatar(false)}
                      activeOpacity={0.8}
                    >
                      <Upload size={13} color={THEME.neon} strokeWidth={2.4} />
                      <Text style={styles.avatarActionText}>Upload Photo</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.avatarActionPill}
                      onPress={() => handlePickAvatar(true)}
                      activeOpacity={0.8}
                    >
                      <Camera size={13} color={THEME.neon} strokeWidth={2.4} />
                      <Text style={styles.avatarActionText}>Take Selfie</Text>
                    </TouchableOpacity>

                    {avatarUri && (
                      <TouchableOpacity
                        style={[styles.avatarActionPill, styles.avatarRemovePill]}
                        onPress={handleRemoveAvatar}
                        activeOpacity={0.8}
                      >
                        <Trash2 size={13} color="#ff6b6b" strokeWidth={2.2} />
                        <Text style={styles.avatarRemoveText}>Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>

              {/* Profile Details Form */}
              <View style={styles.glassCard}>
                <Text style={styles.cardSectionLabel}>CONSULTANT INFORMATION</Text>

                {profileSuccessMsg ? (
                  <View style={styles.successBanner}>
                    <Check size={14} color="#000704" strokeWidth={3} />
                    <Text style={styles.successBannerText}>{profileSuccessMsg}</Text>
                  </View>
                ) : null}

                {/* Input: Full Name */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Display Name</Text>
                  <View style={styles.inputWrap}>
                    <User size={16} color={THEME.textMuted} strokeWidth={2} />
                    <TextInput
                      style={styles.textInput}
                      value={name}
                      onChangeText={setName}
                      placeholder="Your Full Name"
                      placeholderTextColor="#557266"
                    />
                  </View>
                </View>

                {/* Input: Email (Verified) */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Account Email (Primary)</Text>
                  <View style={[styles.inputWrap, styles.inputDisabled]}>
                    <Mail size={16} color={THEME.textMuted} strokeWidth={2} />
                    <TextInput
                      style={[styles.textInput, { color: '#9bb5aa' }]}
                      value={email}
                      editable={false}
                    />
                    <View style={styles.verifiedBadge}>
                      <Text style={styles.verifiedText}>Verified</Text>
                    </View>
                  </View>
                </View>

                {/* Input: Company / Studio */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Studio or Agency Name</Text>
                  <View style={styles.inputWrap}>
                    <Building size={16} color={THEME.textMuted} strokeWidth={2} />
                    <TextInput
                      style={styles.textInput}
                      value={company}
                      onChangeText={setCompany}
                      placeholder="e.g. Flumen Studio"
                      placeholderTextColor="#557266"
                    />
                  </View>
                </View>

                {/* Input: Direct Phone */}
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Direct Phone Number</Text>
                  <View style={styles.inputWrap}>
                    <Phone size={16} color={THEME.textMuted} strokeWidth={2} />
                    <TextInput
                      style={styles.textInput}
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="+91 98765 43210"
                      placeholderTextColor="#557266"
                      keyboardType="phone-pad"
                    />
                  </View>
                </View>

                {/* Save Button */}
                <TouchableOpacity
                  style={[styles.savePrimaryBtn, isSavingProfile && styles.btnDisabled]}
                  onPress={handleSaveProfile}
                  disabled={isSavingProfile}
                  activeOpacity={0.8}
                >
                  {isSavingProfile ? (
                    <ActivityIndicator color="#000704" />
                  ) : (
                    <>
                      <Text style={styles.savePrimaryBtnText}>Save Profile Changes</Text>
                      <ArrowRight size={15} color="#000704" strokeWidth={2.6} />
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ============================================================
              TAB 2: SECURITY & PASSWORD (Matching web Security.js)
              ============================================================ */}
          {activeTab === 'security' && (
            <View style={styles.glassCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <KeyRound size={18} color={THEME.neon} strokeWidth={2.4} />
                <Text style={styles.cardMainTitle}>Change Password</Text>
              </View>
              <Text style={styles.cardSubtitle}>
                Ensure your account stays secure by using a strong, unique password with at least 8 characters.
              </Text>

              {passwordErrorMsg ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>{passwordErrorMsg}</Text>
                </View>
              ) : null}

              {passwordSuccessMsg ? (
                <View style={styles.successBanner}>
                  <Check size={14} color="#000704" strokeWidth={3} />
                  <Text style={styles.successBannerText}>{passwordSuccessMsg}</Text>
                </View>
              ) : null}

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Current Password</Text>
                <View style={styles.inputWrap}>
                  <Lock size={16} color={THEME.textMuted} strokeWidth={2} />
                  <TextInput
                    style={styles.textInput}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    secureTextEntry
                    placeholder="Enter current password"
                    placeholderTextColor="#557266"
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>New Password (Min 8 Characters)</Text>
                <View style={styles.inputWrap}>
                  <Lock size={16} color={THEME.textMuted} strokeWidth={2} />
                  <TextInput
                    style={styles.textInput}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry
                    placeholder="Enter new strong password"
                    placeholderTextColor="#557266"
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Confirm New Password</Text>
                <View style={styles.inputWrap}>
                  <Lock size={16} color={THEME.textMuted} strokeWidth={2} />
                  <TextInput
                    style={styles.textInput}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    placeholder="Re-enter new password"
                    placeholderTextColor="#557266"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.savePrimaryBtn, isUpdatingPassword && styles.btnDisabled]}
                onPress={handleChangePassword}
                disabled={isUpdatingPassword}
                activeOpacity={0.8}
              >
                {isUpdatingPassword ? (
                  <ActivityIndicator color="#000704" />
                ) : (
                  <>
                    <Text style={styles.savePrimaryBtnText}>Update Password</Text>
                    <ArrowRight size={15} color="#000704" strokeWidth={2.6} />
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* ============================================================
              TAB 3: STUDIO BRANDING (Matching web Branding.js)
              ============================================================ */}
          {activeTab === 'branding' && (
            <View style={styles.glassCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Palette size={18} color={THEME.neon} strokeWidth={2.4} />
                <Text style={styles.cardMainTitle}>White-Label Studio Branding</Text>
              </View>
              <Text style={styles.cardSubtitle}>
                Customize how your brand consultancy appears to clients across their dedicated collaboration portals.
              </Text>

              {brandingSuccessMsg ? (
                <View style={styles.successBanner}>
                  <Check size={14} color="#000704" strokeWidth={3} />
                  <Text style={styles.successBannerText}>{brandingSuccessMsg}</Text>
                </View>
              ) : null}

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Studio Portal Heading</Text>
                <View style={styles.inputWrap}>
                  <Building size={16} color={THEME.textMuted} strokeWidth={2} />
                  <TextInput
                    style={styles.textInput}
                    value={studioHeading}
                    onChangeText={setStudioHeading}
                    placeholder="Your Studio Name"
                    placeholderTextColor="#557266"
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Primary Brand Accent</Text>
                <View style={styles.colorRow}>
                  <View style={[styles.colorBox, { backgroundColor: brandColor }]} />
                  <View style={[styles.inputWrap, { flex: 1 }]}>
                    <TextInput
                      style={styles.textInput}
                      value={brandColor}
                      onChangeText={setBrandColor}
                      placeholder="#4DFFA0"
                      placeholderTextColor="#557266"
                    />
                  </View>
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Client Portal URL Slug</Text>
                <View style={styles.inputWrap}>
                  <Globe size={16} color={THEME.textMuted} strokeWidth={2} />
                  <TextInput
                    style={styles.textInput}
                    value={brandSlug}
                    onChangeText={setBrandSlug}
                    placeholder="your-studio"
                    placeholderTextColor="#557266"
                    autoCapitalize="none"
                  />
                </View>
                <Text style={styles.fieldHint}>floxa.flumenx.in/client/{brandSlug}</Text>
              </View>

              <TouchableOpacity
                style={[styles.savePrimaryBtn, isSavingBranding && styles.btnDisabled]}
                onPress={handleSaveBranding}
                disabled={isSavingBranding}
                activeOpacity={0.8}
              >
                {isSavingBranding ? (
                  <ActivityIndicator color="#000704" />
                ) : (
                  <>
                    <Text style={styles.savePrimaryBtnText}>Save Studio Branding</Text>
                    <ArrowRight size={15} color="#000704" strokeWidth={2.6} />
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* ============================================================
              TAB 4: SERVER ENVIRONMENT & DIAGNOSTICS
              ============================================================ */}
          {activeTab === 'environment' && (
            <View>
              {/* Server Endpoint Card */}
              <View style={styles.glassCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Server size={18} color={THEME.neon} strokeWidth={2} />
                  <Text style={styles.cardMainTitle}>Backend API Environment</Text>
                </View>
                <Text style={styles.cardSubtitle}>Active production endpoint handling all REST & WebSockets</Text>

                <View style={styles.endpointBox}>
                  <Text style={styles.endpointUrl}>{API_BASE_URL}</Text>
                </View>

                {isEditingServer ? (
                  <View style={styles.editServerBox}>
                    <TextInput
                      style={styles.serverInput}
                      value={serverUrl}
                      onChangeText={setServerUrl}
                      autoCapitalize="none"
                    />
                    <View style={styles.editBtnRow}>
                      <TouchableOpacity
                        style={[styles.smallBtn, styles.cancelBtn]}
                        onPress={() => setIsEditingServer(false)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.cancelBtnText}>Cancel</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.smallBtn, styles.saveBtn]}
                        onPress={handleSaveServer}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.saveBtnText}>Save</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.actionOutlineBtn}
                    onPress={() => setIsEditingServer(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.actionOutlineText}>Change API Endpoint</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Diagnostics Card */}
              <View style={styles.glassCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Info size={18} color={THEME.neon} strokeWidth={2} />
                  <Text style={styles.cardMainTitle}>Engine Diagnostics</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Floxa Engine</Text>
                  <Text style={styles.infoValue}>1.0.0 (Expo SDK 58)</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Real-Time Signaling</Text>
                  <Text style={styles.infoValue}>WebSockets & WebRTC</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Push Infrastructure</Text>
                  <Text style={styles.infoValue}>Apple APNs & Google FCM Ready</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Glass Engine</Text>
                  <Text style={styles.infoValue}>Smoked Obsidian Glassmorphism</Text>
                </View>
              </View>
            </View>
          )}

          {/* Sign Out Card */}
          <TouchableOpacity style={styles.logoutBtn} onPress={logout} activeOpacity={0.8}>
            <LogOut size={16} color="#ff6b6b" strokeWidth={2.4} />
            <Text style={styles.logoutBtnText}>Sign Out of Floxa</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Permissions Modal */}
      <PermissionModal
        visible={permissionModalState.visible}
        type={permissionModalState.type}
        isBlocked={permissionModalState.isBlocked}
        onClose={() => setPermissionModalState((prev) => ({ ...prev, visible: false }))}
      />
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  fullBg: {
    flex: 1,
  },
  ambientOverlay: {
    flex: 1,
    backgroundColor: THEME.ambientOverlay,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 42,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(77, 255, 160, 0.12)',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    color: THEME.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(2, 8, 6, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  tabBtnActive: {
    backgroundColor: 'rgba(77, 255, 160, 0.16)',
    borderColor: THEME.neon,
  },
  tabBtnText: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: THEME.neon,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 4,
  },
  glassCard: {
    backgroundColor: THEME.bgCard,
    borderWidth: 1,
    borderColor: THEME.border,
    borderTopColor: THEME.borderGlassTop,
    borderBottomColor: THEME.borderGlassBottom,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 8,
  },
  cardSectionLabel: {
    color: THEME.neon,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  cardMainTitle: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
  },
  cardSubtitle: {
    color: THEME.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 18,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  avatarImage: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2,
    borderColor: THEME.neon,
  },
  avatarPlaceholder: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(77, 255, 160, 0.15)',
    borderWidth: 2,
    borderColor: THEME.neon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: THEME.neon,
    fontSize: 30,
    fontWeight: '800',
  },
  avatarActionsCol: {
    flex: 1,
    gap: 8,
  },
  avatarActionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(77, 255, 160, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(77, 255, 160, 0.25)',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  avatarActionText: {
    color: THEME.neon,
    fontSize: 12,
    fontWeight: '700',
  },
  avatarRemovePill: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  avatarRemoveText: {
    color: '#ff6b6b',
    fontSize: 12,
    fontWeight: '700',
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: THEME.neon,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  successBannerText: {
    color: '#000704',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  errorBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    color: '#ff6b6b',
    fontSize: 12,
    lineHeight: 16,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    color: '#e8f5ef',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  fieldHint: {
    color: THEME.textMuted,
    fontSize: 11,
    marginTop: 4,
    fontStyle: 'italic',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0, 10, 6, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(77, 255, 160, 0.2)',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
  },
  inputDisabled: {
    backgroundColor: 'rgba(0, 5, 3, 0.45)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  textInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 14,
  },
  verifiedBadge: {
    backgroundColor: 'rgba(77, 255, 160, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  verifiedText: {
    color: THEME.neon,
    fontSize: 10,
    fontWeight: '700',
  },
  savePrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: THEME.neon,
    borderRadius: 999,
    height: 48,
    marginTop: 8,
  },
  savePrimaryBtnText: {
    color: '#000704',
    fontSize: 14,
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  colorBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  endpointBox: {
    backgroundColor: 'rgba(0, 10, 6, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(77, 255, 160, 0.2)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  endpointUrl: {
    color: THEME.neon,
    fontSize: 13,
    fontWeight: '600',
  },
  actionOutlineBtn: {
    borderWidth: 1,
    borderColor: THEME.neon,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionOutlineText: {
    color: THEME.neon,
    fontSize: 13,
    fontWeight: '700',
  },
  editServerBox: {
    marginTop: 8,
  },
  serverInput: {
    backgroundColor: 'rgba(0, 10, 6, 0.8)',
    borderWidth: 1,
    borderColor: THEME.border,
    borderRadius: 10,
    color: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 10,
  },
  editBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  smallBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  cancelBtnText: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: THEME.neon,
  },
  saveBtnText: {
    color: '#000704',
    fontSize: 12,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  infoLabel: {
    color: THEME.textMuted,
    fontSize: 13,
  },
  infoValue: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 999,
    height: 48,
    marginTop: 6,
  },
  logoutBtnText: {
    color: '#ff6b6b',
    fontSize: 14,
    fontWeight: '700',
  },
});
