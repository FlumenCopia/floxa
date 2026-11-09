import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { MessageSquare, Video, Copy, X, Compass, ExternalLink } from 'lucide-react-native';
import { THEME } from '../constants/theme';
import { ProjectSummary } from '../types';

interface ProjectDetailModalProps {
  visible: boolean;
  project: ProjectSummary | null;
  onClose: () => void;
  onOpenChat: (projectId: string, projectTitle: string, clientName: string) => void;
  onStartCall: (isVideo: boolean) => void;
  onOpenPortal?: (portalToken: string) => void;
}

export const ProjectDetailModal: React.FC<ProjectDetailModalProps> = ({
  visible,
  project,
  onClose,
  onOpenChat,
  onStartCall,
  onOpenPortal,
}) => {
  if (!project) return null;

  const portalLink = `https://floxa.com/client/${project.portalToken || project.id}`;

  const copyPortalLink = () => {
    Alert.alert('Client Portal Link', `${portalLink}\n\n(Share this link with your client to enter their brand portal)`);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.projectTitle} numberOfLines={1}>
                {project.title}
              </Text>
              <Text style={styles.clientSubtitle}>Client: {project.clientName}</Text>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <X size={16} color={THEME.textMuted} strokeWidth={2.5} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Status & Deadline Banner */}
            <View style={styles.card}>
              <View style={styles.rowSb}>
                <Text style={styles.sectionLabel}>CURRENT WORKFLOW STAGE</Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>
                    {project.status.replace(/_/g, ' ').toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${project.progress || 25}%` }]} />
              </View>
              <Text style={styles.progressNote}>{project.progress || 25}% overall completion</Text>
            </View>

            {/* Client Portal Link Card */}
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>CLIENT COLLABORATION PORTAL</Text>
              <Text style={styles.portalUrlText} numberOfLines={1}>
                {portalLink}
              </Text>

              <TouchableOpacity style={styles.copyBtn} onPress={copyPortalLink} activeOpacity={0.8}>
                <Copy size={14} color={THEME.neon} strokeWidth={2} />
                <Text style={styles.copyBtnText}>View & Share Portal Link</Text>
              </TouchableOpacity>

              {onOpenPortal && (project.portalToken || project.id) && (
                <TouchableOpacity
                  style={styles.openPortalBtn}
                  onPress={() => {
                    onClose();
                    onOpenPortal(project.portalToken || project.id);
                  }}
                  activeOpacity={0.8}
                >
                  <Compass size={14} color="#000704" strokeWidth={2.4} />
                  <Text style={styles.openPortalBtnText}>Open 360 Workspace & Portal</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Quick Actions */}
            <View style={styles.actionsGrid}>
              <TouchableOpacity
                style={styles.actionTile}
                onPress={() => {
                  onClose();
                  onOpenChat(project.id, project.title, project.clientName);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.actionIconBox}>
                  <MessageSquare size={20} color={THEME.neon} strokeWidth={2} />
                </View>
                <Text style={styles.actionTileTitle}>Client Chat</Text>
                <Text style={styles.actionTileSub}>Real-time messaging</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionTile}
                onPress={() => {
                  onClose();
                  onStartCall(true);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.actionIconBox}>
                  <Video size={20} color={THEME.neon} strokeWidth={2} />
                </View>
                <Text style={styles.actionTileTitle}>Video Consultation</Text>
                <Text style={styles.actionTileSub}>Join WebRTC room</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
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
    padding: 22,
    maxHeight: '85%',
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
  projectTitle: {
    color: THEME.text,
    fontSize: 20,
    fontWeight: '800',
  },
  clientSubtitle: {
    color: THEME.textMuted,
    fontSize: 13,
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
  card: {
    backgroundColor: THEME.bgCard,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1.2,
    borderColor: 'rgba(77, 255, 160, 0.16)',
    borderTopColor: THEME.borderGlassTop,
    borderBottomColor: THEME.borderGlassBottom,
  },
  rowSb: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionLabel: {
    color: THEME.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  statusBadge: {
    backgroundColor: 'rgba(77, 255, 160, 0.1)',
    borderWidth: 1,
    borderColor: THEME.neon,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    color: THEME.neon,
    fontSize: 10,
    fontWeight: '700',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#020806',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: THEME.neon,
  },
  progressNote: {
    color: THEME.textMuted,
    fontSize: 11,
  },
  portalUrlText: {
    color: THEME.neon,
    fontSize: 13,
    marginVertical: 8,
  },
  copyBtn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(77, 255, 160, 0.12)',
    borderWidth: 1,
    borderColor: THEME.neon,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  copyBtnText: {
    color: THEME.neon,
    fontSize: 13,
    fontWeight: '700',
  },
  openPortalBtn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: THEME.neon,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  openPortalBtnText: {
    color: '#000704',
    fontSize: 13,
    fontWeight: '800',
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  actionTile: {
    flex: 1,
    backgroundColor: THEME.bgCardSolid,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.borderLight,
    alignItems: 'center',
  },
  actionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(77, 255, 160, 0.08)',
    borderWidth: 1,
    borderColor: THEME.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  actionTileTitle: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: '700',
  },
  actionTileSub: {
    color: THEME.textMuted,
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
});
