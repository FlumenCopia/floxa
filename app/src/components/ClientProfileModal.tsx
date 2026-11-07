import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X, Building, Check, ArrowRight, Globe, Phone, Mail, MapPin, Calendar, Briefcase, User } from 'lucide-react-native';
import { api } from '../services/api';
import { THEME } from '../constants/theme';

const INDUSTRIES = [
  'Branding & Design',
  'Technology / SaaS',
  'Food & Beverage',
  'Fashion & Apparel',
  'Real Estate',
  'Healthcare',
  'Education',
  'Hospitality',
  'Finance & Banking',
  'Retail',
  'Manufacturing',
  'Architecture & Interior',
  'Events & Entertainment',
  'Media & Publishing',
];

interface ClientProfileModalProps {
  visible: boolean;
  onClose: () => void;
  projectId: string;
  portalToken?: string;
  initialProfile?: any;
  onProfileUpdated?: (updated: any) => void;
}

export const ClientProfileModal: React.FC<ClientProfileModalProps> = ({
  visible,
  onClose,
  projectId,
  portalToken,
  initialProfile,
  onProfileUpdated,
}) => {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [industry, setIndustry] = useState('Technology / SaaS');
  const [yearStarted, setYearStarted] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (visible && projectId) {
      loadProfile();
    }
  }, [visible, projectId]);

  const loadProfile = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const headers: Record<string, string> = {};
      if (portalToken) headers['X-Client-Portal-Token'] = portalToken;

      const res = await api.get(`/projects/${projectId}/client-profile/`, { headers });
      const data = res.data;
      if (data) {
        setName(data.clientName || data.client_name || '');
        setCompany(data.companyName || data.company_name || '');
        setIndustry(data.industry || 'Technology / SaaS');
        setYearStarted(data.yearStarted ? String(data.yearStarted) : '');
        setLocation(data.location || '');
        setPhone(data.phone || '');
        setEmail(data.email || '');
        setWebsite(data.website || '');
      }
    } catch {
      // Fallback to initialProfile if provided
      if (initialProfile) {
        setName(initialProfile.clientName || initialProfile.client_name || '');
        setCompany(initialProfile.companyName || initialProfile.company_name || '');
        setIndustry(initialProfile.industry || 'Technology / SaaS');
        setYearStarted(initialProfile.yearStarted ? String(initialProfile.yearStarted) : '');
        setLocation(initialProfile.location || '');
        setPhone(initialProfile.phone || '');
        setEmail(initialProfile.email || '');
        setWebsite(initialProfile.website || '');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const filledCount = [name, company, industry, yearStarted, location, phone, email, website].filter(
    (v) => v.trim().length > 0
  ).length;
  const progressPct = Math.round((filledCount / 8) * 100);

  const handleSave = async () => {
    if (!name.trim() || !company.trim() || !email.trim()) {
      setErrorMessage('Please enter your Name, Company, and Email.');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');
    try {
      const headers: Record<string, string> = {};
      if (portalToken) headers['X-Client-Portal-Token'] = portalToken;

      const payload = {
        client_name: name.trim(),
        company_name: company.trim(),
        industry: industry.trim(),
        year_started: yearStarted.trim() ? parseInt(yearStarted.trim(), 10) : null,
        location: location.trim(),
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
        website: website.trim(),
      };

      const res = await api.post(`/projects/${projectId}/client-profile/`, payload, { headers });
      const updated = res.data;

      Alert.alert('Profile Saved', 'Your company profile has been updated.');
      if (onProfileUpdated) onProfileUpdated(updated);
      onClose();
    } catch (err: any) {
      const msg =
        err.response?.data?.phone?.[0] ||
        err.response?.data?.detail ||
        err.message ||
        'Failed to save company profile.';
      setErrorMessage(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <View style={styles.titleWrap}>
                <Building size={18} color={THEME.neon} strokeWidth={2.4} />
                <Text style={styles.modalTitle}>Company Profile</Text>
              </View>
              <Text style={styles.modalSub}>
                Profile Strength: {filledCount}/8 details ({progressPct}%)
              </Text>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <X size={18} color={THEME.textMuted} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>

          {isLoading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color={THEME.neon} size="large" />
              <Text style={styles.loadingText}>Loading company profile...</Text>
            </View>
          ) : (
            <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
              {errorMessage ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : null}

              {/* Full Name */}
              <Text style={styles.fieldLabel}>CLIENT CONTACT NAME *</Text>
              <View style={styles.inputWrap}>
                <User size={16} color="#6b7280" strokeWidth={2} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Alex Johnson"
                  placeholderTextColor="#6b7280"
                  value={name}
                  onChangeText={setName}
                />
              </View>

              {/* Company Name */}
              <Text style={styles.fieldLabel}>COMPANY / BRAND NAME *</Text>
              <View style={styles.inputWrap}>
                <Building size={16} color="#6b7280" strokeWidth={2} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Solaria Dynamics"
                  placeholderTextColor="#6b7280"
                  value={company}
                  onChangeText={setCompany}
                />
              </View>

              {/* Industry Selector */}
              <Text style={styles.fieldLabel}>INDUSTRY SECTOR</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.industryScroll}
                contentContainerStyle={styles.industryScrollContent}
              >
                {INDUSTRIES.map((ind) => {
                  const isSelected = industry === ind;
                  return (
                    <TouchableOpacity
                      key={ind}
                      style={[styles.industryChip, isSelected && styles.industryChipSelected]}
                      onPress={() => setIndustry(ind)}
                      activeOpacity={0.7}
                    >
                      {isSelected ? (
                        <Check size={12} color={THEME.neon} strokeWidth={2.5} style={{ marginRight: 4 }} />
                      ) : null}
                      <Text style={[styles.industryChipText, isSelected && styles.industryChipTextSelected]}>
                        {ind}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Row: Founded Year & Location */}
              <View style={styles.row}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.fieldLabel}>YEAR FOUNDED</Text>
                  <View style={styles.inputWrap}>
                    <Calendar size={16} color="#6b7280" strokeWidth={2} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. 2024"
                      placeholderTextColor="#6b7280"
                      value={yearStarted}
                      onChangeText={setYearStarted}
                      keyboardType="numeric"
                      maxLength={4}
                    />
                  </View>
                </View>

                <View style={{ flex: 1.3 }}>
                  <Text style={styles.fieldLabel}>HEADQUARTERS</Text>
                  <View style={styles.inputWrap}>
                    <MapPin size={16} color="#6b7280" strokeWidth={2} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="e.g. New York, USA"
                      placeholderTextColor="#6b7280"
                      value={location}
                      onChangeText={setLocation}
                    />
                  </View>
                </View>
              </View>

              {/* Email */}
              <Text style={styles.fieldLabel}>BUSINESS EMAIL *</Text>
              <View style={styles.inputWrap}>
                <Mail size={16} color="#6b7280" strokeWidth={2} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="contact@company.com"
                  placeholderTextColor="#6b7280"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              {/* Phone */}
              <Text style={styles.fieldLabel}>CONTACT PHONE</Text>
              <View style={styles.inputWrap}>
                <Phone size={16} color="#6b7280" strokeWidth={2} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="+1 (555) 000-0000"
                  placeholderTextColor="#6b7280"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />
              </View>

              {/* Website */}
              <Text style={styles.fieldLabel}>WEBSITE</Text>
              <View style={styles.inputWrap}>
                <Globe size={16} color="#6b7280" strokeWidth={2} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="https://company.com"
                  placeholderTextColor="#6b7280"
                  value={website}
                  onChangeText={setWebsite}
                  autoCapitalize="none"
                />
              </View>

              {/* Save Button */}
              <TouchableOpacity
                style={[styles.saveBtn, isSaving && styles.btnDisabled]}
                onPress={handleSave}
                disabled={isSaving}
                activeOpacity={0.8}
              >
                {isSaving ? (
                  <ActivityIndicator color={THEME.textDark} />
                ) : (
                  <>
                    <Text style={styles.saveBtnText}>Save Profile Changes</Text>
                    <ArrowRight size={15} color={THEME.textDark} strokeWidth={2.4} />
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'rgba(4, 20, 13, 0.96)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1.2,
    borderTopColor: THEME.borderGlassTop,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 22,
    maxHeight: '92%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    color: THEME.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  modalSub: {
    color: THEME.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressFill: {
    height: '100%',
    backgroundColor: THEME.neon,
  },
  centerBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    color: THEME.textMuted,
    fontSize: 13,
    marginTop: 10,
  },
  errorBox: {
    backgroundColor: 'rgba(255, 107, 107, 0.12)',
    borderWidth: 1,
    borderColor: THEME.danger,
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  errorText: {
    color: THEME.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  formScroll: {
    marginBottom: 10,
  },
  fieldLabel: {
    color: THEME.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 26, 17, 0.75)',
    borderWidth: 1.2,
    borderColor: 'rgba(77, 255, 160, 0.2)',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: THEME.text,
    fontSize: 14,
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
  },
  industryScroll: {
    marginVertical: 4,
  },
  industryScrollContent: {
    gap: 8,
    paddingVertical: 2,
  },
  industryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  industryChipSelected: {
    backgroundColor: 'rgba(77, 255, 160, 0.16)',
    borderColor: THEME.neon,
  },
  industryChipText: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  industryChipTextSelected: {
    color: THEME.neon,
    fontWeight: '700',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: THEME.neon,
    borderRadius: 12,
    height: 50,
    marginTop: 22,
    marginBottom: 20,
    shadowColor: THEME.neon,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 4,
  },
  saveBtnText: {
    color: THEME.textDark,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  btnDisabled: {
    opacity: 0.6,
  },
});

