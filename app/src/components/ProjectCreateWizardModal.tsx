import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X, ArrowRight } from 'lucide-react-native';
import { api } from '../services/api';
import { THEME } from '../constants/theme';

interface ProjectCreateWizardModalProps {
  visible: boolean;
  onClose: () => void;
  onProjectCreated: (newProject: any) => void;
}

export const ProjectCreateWizardModal: React.FC<ProjectCreateWizardModalProps> = ({
  visible,
  onClose,
  onProjectCreated,
}) => {
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [sector, setSector] = useState('Technology & SaaS');
  const [projectValue, setProjectValue] = useState('25000');
  const [advancePercentage, setAdvancePercentage] = useState('50');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!clientName.trim() || !clientEmail.trim() || !companyName.trim()) {
      Alert.alert('Required Fields', 'Please fill in Client Name, Client Email, and Company Name.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        client_name: clientName.trim(),
        client_email: clientEmail.trim().toLowerCase(),
        company_name: companyName.trim(),
        title: projectTitle.trim() || companyName.trim(),
        sector: sector.trim(),
        project_value: parseFloat(projectValue) || 0,
        advance_percentage: parseInt(advancePercentage, 10) || 50,
        mid_percentage: 25,
        final_percentage: 25,
        send_invite: true,
      };

      const res = await api.post('/projects/', payload);
      const created = res.data?.project || res.data;

      Alert.alert(
        'Project Created!',
        `Portal for "${companyName}" is live. Client portal link has been generated.`
      );

      // Reset fields
      setClientName('');
      setClientEmail('');
      setCompanyName('');
      setProjectTitle('');
      onProjectCreated(created);
      onClose();
    } catch (err: any) {
      Alert.alert('Creation Failed', err.response?.data?.detail || err.message);
    } finally {
      setIsSubmitting(false);
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
              <Text style={styles.modalTitle}>Create Brand Project</Text>
              <Text style={styles.modalSub}>Launch a client collaboration portal</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <X size={18} color={THEME.textMuted} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
            {/* Client Name */}
            <Text style={styles.label}>CLIENT FULL NAME *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Sarah Jenkins"
              placeholderTextColor={THEME.textPlaceholder}
              value={clientName}
              onChangeText={setClientName}
            />

            {/* Client Email */}
            <Text style={styles.label}>CLIENT EMAIL ADDRESS *</Text>
            <TextInput
              style={styles.input}
              placeholder="sarah@company.com"
              placeholderTextColor={THEME.textPlaceholder}
              value={clientEmail}
              onChangeText={setClientEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            {/* Company Name */}
            <Text style={styles.label}>COMPANY / BRAND NAME *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Lumina Studio"
              placeholderTextColor={THEME.textPlaceholder}
              value={companyName}
              onChangeText={setCompanyName}
            />

            {/* Project Title */}
            <Text style={styles.label}>PROJECT TITLE</Text>
            <TextInput
              style={styles.input}
              placeholder="Leave blank to use company name"
              placeholderTextColor={THEME.textPlaceholder}
              value={projectTitle}
              onChangeText={setProjectTitle}
            />

            {/* Project Budget Value */}
            <View style={styles.twoCol}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.label}>PROJECT VALUE (₹)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="25000"
                  placeholderTextColor={THEME.textPlaceholder}
                  value={projectValue}
                  onChangeText={setProjectValue}
                  keyboardType="numeric"
                />
              </View>

              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.label}>ADVANCE (%)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="50"
                  placeholderTextColor={THEME.textPlaceholder}
                  value={advancePercentage}
                  onChangeText={setAdvancePercentage}
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitBtn, isSubmitting && styles.btnDisabled]}
              onPress={handleSubmit}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator color={THEME.textDark} />
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.submitBtnText}>Launch Portal & Invite Client</Text>
                  <ArrowRight size={15} color={THEME.textDark} strokeWidth={2.4} />
                </View>
              )}
            </TouchableOpacity>
          </ScrollView>
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
    backgroundColor: 'rgba(4, 20, 13, 0.94)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1.2,
    borderTopColor: THEME.borderGlassTop,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 24,
    maxHeight: '90%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
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
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    color: THEME.textMuted,
    fontSize: 16,
    fontWeight: 'bold',
  },
  formScroll: {
    marginBottom: 20,
  },
  label: {
    color: THEME.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#020806',
    borderWidth: 1,
    borderColor: THEME.borderLight,
    borderRadius: 10,
    color: THEME.text,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  twoCol: {
    flexDirection: 'row',
  },
  submitBtn: {
    backgroundColor: THEME.neon,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 16,
    shadowColor: THEME.neon,
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  submitBtnText: {
    color: THEME.textDark,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  btnDisabled: {
    opacity: 0.6,
  },
});

