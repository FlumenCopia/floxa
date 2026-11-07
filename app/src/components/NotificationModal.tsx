import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Bell, X, CheckCheck, Sparkles, Palette, FileText, Check, Clock } from 'lucide-react-native';
import { api } from '../services/api';
import { THEME } from '../constants/theme';

interface ActivityItem {
  id: string;
  action: string;
  action_display?: string;
  projectTitle?: string;
  projectName?: string;
  clientName?: string;
  createdAt?: string;
  created_at?: string;
  read?: boolean;
}

interface NotificationModalProps {
  visible: boolean;
  onClose: () => void;
  onNotificationCountChange?: (count: number) => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  visible,
  onClose,
  onNotificationCountChange,
}) => {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingRead, setIsMarkingRead] = useState(false);

  useEffect(() => {
    if (visible) {
      loadActivities();
    }
  }, [visible]);

  const loadActivities = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/projects/activities/');
      const raw = res.data?.activities || res.data || [];
      const list = Array.isArray(raw) ? raw : [];
      setActivities(list);
      const unreadCount = list.filter((a: any) => !a.read).length;
      if (onNotificationCountChange) onNotificationCountChange(unreadCount);
    } catch {
      // Keep existing activities on error
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkAllRead = async () => {
    setIsMarkingRead(true);
    try {
      await api.post('/projects/activities/mark-read/', {}).catch(() => {});
      setActivities((prev) => prev.map((a) => ({ ...a, read: true })));
      if (onNotificationCountChange) onNotificationCountChange(0);
    } finally {
      setIsMarkingRead(false);
    }
  };

  const unreadCount = activities.filter((a) => !a.read).length;

  const getActivityIcon = (action: string) => {
    if (action.includes('moodboard')) {
      return <Palette size={14} color={THEME.neon} strokeWidth={2} />;
    }
    if (action.includes('concept') || action.includes('dna')) {
      return <Sparkles size={14} color={THEME.neon} strokeWidth={2} />;
    }
    if (action.includes('agreement') || action.includes('contract')) {
      return <FileText size={14} color={THEME.neon} strokeWidth={2} />;
    }
    return <Clock size={14} color={THEME.neon} strokeWidth={2} />;
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.headRow}>
            <View style={styles.titleWrap}>
              <Bell size={18} color={THEME.neon} strokeWidth={2.4} />
              <Text style={styles.title}>Notifications</Text>
              {unreadCount > 0 ? (
                <View style={styles.unreadPill}>
                  <Text style={styles.unreadPillText}>{unreadCount} new</Text>
                </View>
              ) : (
                <View style={styles.allCaughtUpPill}>
                  <Text style={styles.allCaughtUpText}>All caught up</Text>
                </View>
              )}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {unreadCount > 0 && (
                <TouchableOpacity
                  style={styles.markAllBtn}
                  onPress={handleMarkAllRead}
                  disabled={isMarkingRead}
                >
                  <CheckCheck size={12} color={THEME.neon} strokeWidth={2.4} />
                  <Text style={styles.markAllText}>Mark Read</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <X size={16} color={THEME.textMuted} strokeWidth={2.4} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Body */}
          {isLoading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color={THEME.neon} size="small" />
              <Text style={styles.loadingText}>Loading notifications...</Text>
            </View>
          ) : activities.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No Recent Activity</Text>
              <Text style={styles.emptySub}>Client responses and approvals will appear here.</Text>
            </View>
          ) : (
            <ScrollView style={styles.scrollList} showsVerticalScrollIndicator={false}>
              {activities.map((act) => {
                const title =
                  act.action_display ||
                  act.action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                const project = act.projectTitle || act.projectName || 'Brand Project';
                const date = act.createdAt || act.created_at || '';
                const timeStr = date ? new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

                return (
                  <View key={act.id} style={[styles.activityItem, !act.read && styles.activityItemUnread]}>
                    <View style={styles.iconCircle}>{getActivityIcon(act.action)}</View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.activityTitle}>{title}</Text>
                      <Text style={styles.activityProject}>{project}</Text>
                      {timeStr ? <Text style={styles.activityTime}>{timeStr}</Text> : null}
                    </View>

                    {!act.read && <View style={styles.unreadDot} />}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-start',
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  modalCard: {
    backgroundColor: 'rgba(4, 20, 13, 0.96)',
    borderRadius: 24,
    borderWidth: 1.2,
    borderColor: 'rgba(77, 255, 160, 0.22)',
    borderTopColor: THEME.borderGlassTop,
    borderBottomColor: THEME.borderGlassBottom,
    padding: 18,
    maxHeight: '75%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.7,
    shadowRadius: 30,
    elevation: 10,
  },
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  unreadPill: {
    backgroundColor: 'rgba(77, 255, 160, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(77, 255, 160, 0.35)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  unreadPillText: {
    color: THEME.neon,
    fontSize: 10,
    fontWeight: '700',
  },
  allCaughtUpPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  allCaughtUpText: {
    color: THEME.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(77, 255, 160, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(77, 255, 160, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  markAllText: {
    color: THEME.neon,
    fontSize: 11,
    fontWeight: '700',
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBox: {
    paddingVertical: 36,
    alignItems: 'center',
  },
  loadingText: {
    color: THEME.textMuted,
    fontSize: 12,
    marginTop: 8,
  },
  emptyBox: {
    paddingVertical: 36,
    alignItems: 'center',
  },
  emptyTitle: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySub: {
    color: THEME.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  scrollList: {
    marginTop: 8,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
  },
  activityItemUnread: {
    backgroundColor: 'rgba(77, 255, 160, 0.04)',
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(77, 255, 160, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  activityTitle: {
    color: THEME.text,
    fontSize: 13,
    fontWeight: '700',
  },
  activityProject: {
    color: THEME.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  activityTime: {
    color: THEME.textDim,
    fontSize: 10,
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: THEME.neon,
    marginLeft: 8,
  },
});

