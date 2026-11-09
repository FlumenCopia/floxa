import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
  ImageBackground,
} from 'react-native';
import {
  FolderKanban,
  Clock,
  TrendingUp,
  Sparkles,
  Plus,
  ArrowRight,
  MessageSquare,
  Bell,
} from 'lucide-react-native';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../constants/theme';
import { ProjectCreateWizardModal } from '../components/ProjectCreateWizardModal';
import { NotificationModal } from '../components/NotificationModal';
import { ProjectSummary } from '../types';

interface DashboardScreenProps {
  onOpenProject: (projectId: string, projectTitle: string, clientName: string) => void;
  onNavigateToProjects: () => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  onOpenProject,
  onNavigateToProjects,
}) => {
  const { user } = useAuth();
  const consultant = user as any;

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  const fetchDashboardData = useCallback(async () => {
    try {
      const [projRes, actRes] = await Promise.all([
        api.get('/projects/'),
        api.get('/projects/activities/').catch(() => ({ data: [] })),
      ]);

      const rawProjects = projRes.data?.results || projRes.data || [];
      const parsedProjects: ProjectSummary[] = rawProjects.map((p: any) => ({
        id: p.id || p._id,
        title: p.title || 'Brand Project',
        status: p.status || 'discovery',
        clientName: p.client?.name || p.client_name || p.company_name || 'Client',
        companyName: p.company_name,
        portalToken: p.portal_token || p.portalToken,
        progress: p.progress || 20,
        unreadCount: p.unread_messages_count || 0,
        updatedAt: p.updated_at || p.updatedAt,
      }));

      setProjects(parsedProjects);
      const actList = Array.isArray(actRes.data) ? actRes.data : actRes.data?.activities || [];
      setActivities(actList.slice(0, 5));
      const unread = actList.filter((a: any) => !a.read).length;
      setUnreadNotifCount(unread);
    } catch (err: any) {
      console.warn('Failed to load dashboard data:', err.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchDashboardData();
  };

  const totalProjects = projects.length;
  const avgCompletion =
    totalProjects > 0
      ? Math.round(projects.reduce((acc, p) => acc + (p.progress || 20), 0) / totalProjects)
      : 0;

  return (
    <ImageBackground
      source={require('../../assets/banner1.png')}
      style={styles.fullBg}
      resizeMode="cover"
    >
      <View style={styles.ambientOverlay}>
        {/* Top Header */}
        <View style={styles.topbar}>
          <Image
            source={require('../../assets/FLOXA_log.png')}
            style={styles.logoImg}
            resizeMode="contain"
          />

          <View style={styles.topbarRight}>
            <TouchableOpacity
              style={styles.bellBtn}
              onPress={() => setIsNotifOpen(true)}
              activeOpacity={0.8}
            >
              <Bell size={18} color={THEME.neon} strokeWidth={2} />
              {unreadNotifCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unreadNotifCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.newProjectTopBtn}
              onPress={() => setIsWizardOpen(true)}
              activeOpacity={0.8}
            >
              <Plus size={14} color="#000704" strokeWidth={2.6} />
              <Text style={styles.newProjectTopText}>New Project</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={THEME.neon} />
          }
        >
          {/* Welcome Consultant Banner */}
          <View style={styles.welcomeBanner}>
            <Text style={styles.welcomeGreeting}>Welcome back,</Text>
            <Text style={styles.consultantTitle}>{consultant?.name || 'Brand Consultant'}</Text>
            <Text style={styles.agencySubtitle}>
              {consultant?.company ? `Agency: ${consultant.company}` : 'Floxa Brand Identity Platform'}
            </Text>
          </View>

          {/* KPI Grid (Matching Web Dashboardsection.jsx) */}
          <View style={styles.kpiGrid}>
            {/* Card 1: Active Projects */}
            <View style={styles.kpiCard}>
              <View style={styles.kpiHeader}>
                <Text style={styles.kpiLabel}>ACTIVE PROJECTS</Text>
                <View style={styles.kpiIconWrap}>
                  <FolderKanban size={18} color={THEME.neon} strokeWidth={2} />
                </View>
              </View>
              <Text style={styles.kpiValue}>{totalProjects}</Text>
              <View style={styles.kpiDeltaRow}>
                <View style={styles.greenStatusDot} />
                <Text style={styles.kpiDeltaText}>In Progress</Text>
              </View>
            </View>

            {/* Card 2: Avg Completion */}
            <View style={styles.kpiCard}>
              <View style={styles.kpiHeader}>
                <Text style={styles.kpiLabel}>AVG COMPLETION</Text>
                <View style={styles.kpiIconWrap}>
                  <Clock size={18} color={THEME.neon} strokeWidth={2} />
                </View>
              </View>
              <Text style={styles.kpiValue}>{avgCompletion}%</Text>
              <Text style={styles.kpiDelta}>Across portfolio</Text>
            </View>

            {/* Card 3: Revenue / Value */}
            <View style={styles.kpiCard}>
              <View style={styles.kpiHeader}>
                <Text style={styles.kpiLabel}>COMMITTED VALUE</Text>
                <View style={styles.kpiIconWrap}>
                  <TrendingUp size={18} color={THEME.neon} strokeWidth={2} />
                </View>
              </View>
              <Text style={styles.kpiValue}>Active</Text>
              <Text style={styles.kpiDelta}>Milestones secured</Text>
            </View>

            {/* Card 4: AI Suite */}
            <View style={styles.kpiCard}>
              <View style={styles.kpiHeader}>
                <Text style={styles.kpiLabel}>AI ADOPTION</Text>
                <View style={styles.kpiIconWrap}>
                  <Sparkles size={18} color={THEME.neon} strokeWidth={2} />
                </View>
              </View>
              <Text style={styles.kpiValue}>Ready</Text>
              <Text style={styles.kpiDelta}>Identity tools</Text>
            </View>
          </View>

          {/* Recent Projects Section */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Recent Projects</Text>
            <TouchableOpacity
              onPress={onNavigateToProjects}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Text style={styles.viewAllText}>View All ({totalProjects})</Text>
              <ArrowRight size={13} color={THEME.neon} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <ActivityIndicator color={THEME.neon} style={{ marginVertical: 20 }} />
          ) : projects.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No Projects Created Yet</Text>
              <Text style={styles.emptySub}>
                Tap the button below to launch your first client portal.
              </Text>
              <TouchableOpacity
                style={styles.createProjectBtn}
                onPress={() => setIsWizardOpen(true)}
                activeOpacity={0.8}
              >
                <Plus size={16} color="#000704" strokeWidth={2.6} />
                <Text style={styles.createProjectBtnText}>Create Brand Project</Text>
              </TouchableOpacity>
            </View>
          ) : (
            projects.slice(0, 3).map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.recentCard}
                onPress={() => onOpenProject(item.id, item.title, item.clientName)}
                activeOpacity={0.75}
              >
                <View style={styles.recentHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recentProjectTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.recentClientName}>{item.clientName}</Text>
                  </View>
                  <View style={styles.recentBadge}>
                    <Text style={styles.recentBadgeText}>
                      {item.status.replace(/_/g, ' ').toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.recentProgressTrack}>
                  <View style={[styles.recentProgressFill, { width: `${item.progress || 20}%` }]} />
                </View>

                <View style={styles.recentFooter}>
                  <Text style={styles.recentProgressLabel}>{item.progress || 20}% Complete</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.recentActionText}>Open Chat</Text>
                    <ArrowRight size={12} color={THEME.neon} strokeWidth={2} />
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}

          {/* Recent Activities Section (Audit Stream) */}
          {activities.length > 0 && (
            <View style={styles.activitySection}>
              <Text style={styles.sectionTitle}>Recent Activity Stream</Text>
              <View style={styles.activityCard}>
                {activities.map((act, idx) => (
                  <View key={act._id || idx} style={styles.activityRow}>
                    <View style={styles.activityDot} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.activityDesc}>{act.description || act.action}</Text>
                      <Text style={styles.activityTime}>
                        {act.createdAt
                          ? new Date(act.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Recent'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        {/* Project Creation Modal */}
        <ProjectCreateWizardModal
          visible={isWizardOpen}
          onClose={() => setIsWizardOpen(false)}
          onProjectCreated={() => {
            fetchDashboardData();
          }}
        />

        {/* Notifications Modal */}
        <NotificationModal
          visible={isNotifOpen}
          onClose={() => setIsNotifOpen(false)}
          onNotificationCountChange={setUnreadNotifCount}
        />
      </View>
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
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  topbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(4, 20, 13, 0.72)',
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  logoImg: {
    width: 110,
    height: 34,
  },
  topbarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bellBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(77, 255, 160, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(77, 255, 160, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notifBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: THEME.neon,
    borderRadius: 8,
    paddingHorizontal: 4,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadgeText: {
    color: THEME.textDark,
    fontSize: 9,
    fontWeight: '900',
  },
  newProjectTopBtn: {
    backgroundColor: THEME.neon,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  newProjectTopText: {
    color: THEME.textDark,
    fontSize: 12,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  welcomeBanner: {
    backgroundColor: THEME.bgCard,
    borderRadius: 22,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1.2,
    borderColor: THEME.border,
    borderTopColor: THEME.borderGlassTop,
    borderBottomColor: THEME.borderGlassBottom,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 6,
  },
  welcomeGreeting: {
    color: THEME.textMuted,
    fontSize: 12,
  },
  consultantTitle: {
    color: THEME.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: 0.3,
  },
  agencySubtitle: {
    color: THEME.neon,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  kpiCard: {
    width: '48%',
    backgroundColor: THEME.bgCard,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.2,
    borderColor: THEME.border,
    borderTopColor: THEME.borderGlassTop,
    borderBottomColor: THEME.borderGlassBottom,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 5,
  },
  kpiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  kpiLabel: {
    color: THEME.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  kpiIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: 'rgba(77, 255, 160, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiValue: {
    color: THEME.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  kpiDelta: {
    color: THEME.neon,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  kpiDeltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  greenStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.neon,
  },
  kpiDeltaText: {
    color: THEME.neon,
    fontSize: 11,
    fontWeight: '600',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: THEME.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  viewAllText: {
    color: THEME.neon,
    fontSize: 13,
    fontWeight: '600',
  },
  recentCard: {
    backgroundColor: THEME.bgCard,
    borderRadius: 22,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1.2,
    borderColor: THEME.border,
    borderTopColor: THEME.borderGlassTop,
    borderBottomColor: THEME.borderGlassBottom,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 5,
  },
  recentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  recentProjectTitle: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: '700',
  },
  recentClientName: {
    color: THEME.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  recentBadge: {
    backgroundColor: 'rgba(77, 255, 160, 0.1)',
    borderWidth: 1,
    borderColor: THEME.neon,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  recentBadgeText: {
    color: THEME.neon,
    fontSize: 10,
    fontWeight: '700',
  },
  recentProgressTrack: {
    height: 6,
    backgroundColor: '#020806',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  recentProgressFill: {
    height: '100%',
    backgroundColor: THEME.neon,
  },
  recentFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recentProgressLabel: {
    color: THEME.textMuted,
    fontSize: 11,
  },
  recentActionText: {
    color: THEME.neon,
    fontSize: 12,
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: THEME.bgCard,
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1.2,
    borderColor: THEME.border,
    borderTopColor: THEME.borderGlassTop,
    borderBottomColor: THEME.borderGlassBottom,
  },
  emptyTitle: {
    color: THEME.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySub: {
    color: THEME.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 16,
  },
  createProjectBtn: {
    backgroundColor: THEME.neon,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  createProjectBtnText: {
    color: THEME.textDark,
    fontSize: 13,
    fontWeight: '700',
  },
  activitySection: {
    marginTop: 12,
  },
  activityCard: {
    backgroundColor: THEME.bgCard,
    borderRadius: 22,
    padding: 16,
    marginTop: 10,
    borderWidth: 1.2,
    borderColor: THEME.border,
    borderTopColor: THEME.borderGlassTop,
    borderBottomColor: THEME.borderGlassBottom,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    gap: 10,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: THEME.neon,
  },
  activityDesc: {
    color: THEME.text,
    fontSize: 13,
  },
  activityTime: {
    color: THEME.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
});

