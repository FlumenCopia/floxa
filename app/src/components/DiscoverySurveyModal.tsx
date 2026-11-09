import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { X, Check, ArrowRight } from 'lucide-react-native';
import { api } from '../services/api';
import { THEME } from '../constants/theme';

interface DiscoverySurveyModalProps {
  visible: boolean;
  portalToken: string;
  onClose: () => void;
  onSubmitted: () => void;
}

const SLIDERS = [
  { key: 'playfulSerious', left: 'Playful', right: 'Serious' },
  { key: 'unconventionalMainstream', left: 'Unconventional', right: 'Mainstream' },
  { key: 'industrialNatural', left: 'Industrial', right: 'Natural' },
  { key: 'approachableElite', left: 'Approachable', right: 'Elite' },
  { key: 'casualElegant', left: 'Casual', right: 'Elegant' },
  { key: 'refinedStrong', left: 'Refined', right: 'Strong' },
];

const EMOTION_TAGS = [
  'Trust',
  'Bold',
  'Warm',
  'Calm',
  'Sharp',
  'Fresh',
  'Playful',
  'Refined',
  'Vibrant',
  'Heritage',
  'Modern',
  'Pure',
  'Confident',
  'Dynamic',
];

export const DiscoverySurveyModal: React.FC<DiscoverySurveyModalProps> = ({
  visible,
  portalToken,
  onClose,
  onSubmitted,
}) => {
  const [sliderValues, setSliderValues] = useState<Record<string, number>>({
    playfulSerious: 0,
    unconventionalMainstream: 0,
    industrialNatural: 0,
    approachableElite: 0,
    casualElegant: 0,
    refinedStrong: 0,
  });

  const [selectedTags, setSelectedTags] = useState<string[]>(['Trust', 'Modern', 'Bold']);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter((t) => t !== tag));
    } else {
      if (selectedTags.length >= 5) {
        Alert.alert('Limit Reached', 'You can select up to 5 core brand emotions.');
        return;
      }
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleStepSlider = (key: string, step: number) => {
    setSliderValues((prev) => ({
      ...prev,
      [key]: Math.max(-2, Math.min(2, (prev[key] || 0) + step)),
    }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await api.post(`/client-portal/${portalToken}/discovery/`, {
        sliders: sliderValues,
        emotions: selectedTags,
      });

      await api.post(`/client-portal/${portalToken}/discovery/submit/`).catch(() => {});

      Alert.alert(
        'Discovery Submitted!',
        'Your brand personality and traits have been sent to your consultant to craft your Brand DNA.'
      );
      onSubmitted();
      onClose();
    } catch (err: any) {
      Alert.alert('Submission Error', err.response?.data?.detail || err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.modalTitle}>Brand Discovery Intake</Text>
              <Text style={styles.modalSub}>Define your brand tone, traits & emotional identity</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <X size={18} color={THEME.textMuted} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
            {/* Sliders Section */}
            <Text style={styles.sectionTitle}>1. Brand Spectrum Sliders</Text>
            <Text style={styles.sectionDesc}>
              Tap the steps to steer where your brand sits on each spectrum.
            </Text>

            {SLIDERS.map((s) => {
              const val = sliderValues[s.key] || 0;

              return (
                <View key={s.key} style={styles.sliderCard}>
                  <View style={styles.sliderLabelsRow}>
                    <Text style={[styles.sliderLabel, val < 0 && styles.sliderLabelActive]}>
                      {s.left}
                    </Text>
                    <Text style={[styles.sliderLabel, val > 0 && styles.sliderLabelActive]}>
                      {s.right}
                    </Text>
                  </View>

                  <View style={styles.sliderTrackRow}>
                    {[-2, -1, 0, 1, 2].map((step) => (
                      <TouchableOpacity
                        key={step}
                        style={[
                          styles.sliderStepDot,
                          val === step && styles.sliderStepDotActive,
                        ]}
                        onPress={() => setSliderValues((prev) => ({ ...prev, [s.key]: step }))}
                      >
                        <Text
                          style={[
                            styles.sliderStepText,
                            val === step && styles.sliderStepTextActive,
                          ]}
                        >
                          {step === 0 ? '•' : step > 0 ? `+${step}` : step}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              );
            })}

            {/* Core Emotion Tags */}
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>2. Brand Emotion Tags (Pick up to 5)</Text>
            <View style={styles.tagsGrid}>
              {EMOTION_TAGS.map((tag) => {
                const isSelected = selectedTags.includes(tag);

                return (
                  <TouchableOpacity
                    key={tag}
                    style={[styles.tagChip, isSelected && styles.tagChipActive]}
                    onPress={() => toggleTag(tag)}
                    activeOpacity={0.7}
                  >
                    {isSelected && (
                      <Check size={12} color={THEME.neon} strokeWidth={3} style={{ marginRight: 4 }} />
                    )}
                    <Text style={[styles.tagText, isSelected && styles.tagTextActive]}>
                      {tag}
                    </Text>
                  </TouchableOpacity>
                );
              })}
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
                  <Text style={styles.submitBtnText}>Submit Discovery to Consultant</Text>
                  <ArrowRight size={15} color={THEME.textDark} strokeWidth={2.4} />
                </View>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: THEME.bgSurface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: THEME.border,
    padding: 20,
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
  sectionTitle: {
    color: THEME.text,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
  },
  sectionDesc: {
    color: THEME.textMuted,
    fontSize: 12,
    marginTop: 2,
    marginBottom: 12,
  },
  sliderCard: {
    backgroundColor: '#020806',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: THEME.borderLight,
  },
  sliderLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sliderLabel: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  sliderLabelActive: {
    color: THEME.neon,
    fontWeight: '700',
  },
  sliderTrackRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 20,
    padding: 4,
  },
  sliderStepDot: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 16,
  },
  sliderStepDotActive: {
    backgroundColor: THEME.neon,
  },
  sliderStepText: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  sliderStepTextActive: {
    color: THEME.textDark,
    fontWeight: '800',
  },
  tagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#020806',
    borderWidth: 1,
    borderColor: THEME.borderLight,
  },
  tagChipActive: {
    borderColor: THEME.neon,
    backgroundColor: 'rgba(77, 255, 160, 0.15)',
  },
  tagText: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  tagTextActive: {
    color: THEME.neon,
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: THEME.neon,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
    shadowColor: THEME.neon,
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  submitBtnText: {
    color: THEME.textDark,
    fontSize: 14,
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
