import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
} from 'react-native';
import {
  Camera,
  Mic,
  Image as ImageIcon,
  Bell,
  Settings,
  X,
  ShieldCheck,
} from 'lucide-react-native';
import { THEME } from '../constants/theme';
import { FloxaPermissionType, PermissionService } from '../services/permissions';

interface PermissionModalProps {
  visible: boolean;
  type: FloxaPermissionType;
  isBlocked?: boolean;
  onGrant?: () => void;
  onClose: () => void;
}

export const PermissionModal: React.FC<PermissionModalProps> = ({
  visible,
  type,
  isBlocked = false,
  onGrant,
  onClose,
}) => {
  const getPermissionMeta = () => {
    switch (type) {
      case 'camera':
        return {
          icon: <Camera size={32} color={THEME.neon} strokeWidth={2.2} />,
          title: 'Camera Access Needed',
          desc: 'Floxa requires camera access for live WebRTC video consultations with your brand team and taking photos.',
          privacy: 'Your camera is only accessed while actively inside an authorized video call or taking a photo.',
        };
      case 'microphone':
        return {
          icon: <Mic size={32} color={THEME.neon} strokeWidth={2.2} />,
          title: 'Microphone Access Needed',
          desc: 'Floxa requires microphone access for crystal-clear voice consultations and high-fidelity audio notes.',
          privacy: 'Audio is only recorded when you explicitly press the microphone button or start a call.',
        };
      case 'mediaLibrary':
        return {
          icon: <ImageIcon size={32} color={THEME.neon} strokeWidth={2.2} />,
          title: 'Photo Library Access Needed',
          desc: 'Floxa needs access to your photos to upload brand assets, attach images in project chat, and set avatars.',
          privacy: 'Only the specific files you pick from your gallery are accessed and shared with your team.',
        };
      case 'notifications':
        return {
          icon: <Bell size={32} color={THEME.neon} strokeWidth={2.2} />,
          title: 'Push Notifications Needed',
          desc: 'Receive instant notifications for incoming client consultation calls, new team messages, and milestone approvals.',
          privacy: 'You can customize or silence notification alerts anytime in settings.',
        };
    }
  };

  const meta = getPermissionMeta();

  const handleAction = async () => {
    if (isBlocked) {
      await PermissionService.openSettings();
      onClose();
    } else {
      if (onGrant) {
        onGrant();
      } else {
        onClose();
      }
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.glassCard}>
          {/* Header Close */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <X size={16} color={THEME.textMuted} strokeWidth={2.4} />
          </TouchableOpacity>

          {/* Icon Badge */}
          <View style={styles.iconCircle}>{meta.icon}</View>

          {/* Title & Desc */}
          <Text style={styles.modalTitle}>{meta.title}</Text>
          <Text style={styles.modalDesc}>{meta.desc}</Text>

          {/* Privacy Note */}
          <View style={styles.privacyBox}>
            <ShieldCheck size={16} color={THEME.neon} strokeWidth={2} style={{ marginTop: 1 }} />
            <Text style={styles.privacyText}>{meta.privacy}</Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.cancelBtnText}>Not Now</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.grantBtn} onPress={handleAction} activeOpacity={0.8}>
              {isBlocked ? (
                <>
                  <Settings size={15} color={THEME.textDark} strokeWidth={2.4} />
                  <Text style={styles.grantBtnText}>Open Settings</Text>
                </>
              ) : (
                <Text style={styles.grantBtnText}>Allow Access</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 7, 4, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  glassCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: 'rgba(4, 20, 13, 0.96)',
    borderRadius: 26,
    borderWidth: 1.2,
    borderColor: THEME.border,
    borderTopColor: THEME.borderGlassTop,
    borderBottomColor: THEME.borderGlassBottom,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.65,
    shadowRadius: 30,
    elevation: 12,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  iconCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: 'rgba(77, 255, 160, 0.12)',
    borderWidth: 1.5,
    borderColor: THEME.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 16,
  },
  modalTitle: {
    color: THEME.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  modalDesc: {
    color: THEME.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 16,
  },
  privacyBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(77, 255, 160, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(77, 255, 160, 0.18)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 22,
    width: '100%',
  },
  privacyText: {
    flex: 1,
    color: THEME.text,
    fontSize: 11.5,
    lineHeight: 16,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: THEME.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  grantBtn: {
    flex: 1.3,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: THEME.neon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grantBtnText: {
    color: THEME.textDark,
    fontSize: 13,
    fontWeight: '800',
  },
});

