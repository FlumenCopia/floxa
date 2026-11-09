import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
  ScrollView,
  ImageBackground,
} from 'react-native';
import {
  Search,
  X,
  Plus,
  MessageSquare,
  Clock,
  ArrowRight,
  Bell,
} from 'lucide-react-native';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ProjectSummary } from '../types';
import { THEME } from '../constants/theme';
import { ProjectDetailModal } from '../components/ProjectDetailModal';
import { ProjectCreateWizardModal } from '../components/ProjectCreateWizardModal';
import { NotificationModal } from '../components/NotificationModal';

interface ProjectsScreenProps {
  onSelectProject: (projectId: string, projectTitle: string, clientName: string) => void;
  onStartCall?: (isVideo: boolean) => void;
  onOpenPortal?: (portalToken: string) => void;
}

const STATUS_FILTERS = [
  'All',
  'Discovery',
  'Brand DNA',
  'Moodboards',
  'Concepts',
  'Deliverables',
  'Delivered',
];

export const ProjectsScreen: React.FC<ProjectsScreenProps> = ({
  onSelectProject,
  onStartCall,
  onOpenPortal,
}) => {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<ProjectSummary[]>([]);
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [selectedProject, setSelectedProject] = useState<ProjectSummary | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  const fetchProjects = useCallback(async () => {
    try {
      setError(null);
      const res = await api.get('/projects/');
      const rawList = res.data?.results || res.data || [];

      const parsed: ProjectSummary[] = rawList.map((p: any) => ({
        id: p.id || p._id,
        title: p.title || 'Untitled Project',
        status: p.status || 'discovery',
        clientName: p.client?.name || p.client_name || p.company_name || 'Client',
        companyName: p.company_name,
        portalToken: p.portal_token || p.portalToken,
        progress: p.progress || 25,
        unreadCount: p.unread_messages_count || 0,
        updatedAt: p.updated_at || p.updatedAt,
      }));

      setProjects(parsed);
      applyFilterAndSearch(parsed, activeFilter, searchQuery);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load projects');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeFilter, searchQuery]);

  const applyFilterAndSearch = (list: ProjectSummary[], filter: string, query: string) => {
    let result = list;

    if (filter !== 'All') {
      const match = filter.toLowerCase().replace(/\s+/g, '_');
      result = result.filter((p) => p.status.toLowerCase().includes(match));
    }

    if (query.trim()) {
      const q = query.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.clientName.toLowerCase().includes(q) ||
          (p.companyName && p.companyName.toLowerCase().includes(q))
      );
    }

    setFilteredProjects(result);
  };

  const handleSelectFilter = (filter: string) => {
    setActiveFilter(filter);
    applyFilterAndSearch(projects, filter, searchQuery);
  };

  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    applyFilterAndSearch(projects, activeFilter, text);
  };

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchProjects();
  };

  const getStatusBadgeStyle = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('deliver') || s.includes('paid')) {
      return { bg: 'rgba(77, 255, 160, 0.12)', border: THEME.neon, text: THEME.neon };
    }
    if (s.includes('concept') || s.includes('brand') || s.includes('moodboard')) {
      return { bg: 'rgba(74, 158, 255, 0.12)', border: THEME.cobalt, text: THEME.cobalt };
    }
    return { bg: 'rgba(240, 180, 41, 0.12)', border: THEME.amber, text: THEME.amber };
  };

  const renderProjectItem = ({ item }: { item: ProjectSummary }) => {
    const badgeStyle = getStatusBadgeStyle(item.status);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => setSelectedProject(item)}
        activeOpacity={0.75}
      >
        <View style={styles.cardHeader}>
          <View style={styles.titleWrap}>
            <Text style={styles.projectTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.clientSubtitle}>Client: {item.clientName}</Text>
          </View>

          <View
            style={[
              styles.statusBadge,
              { backgroundColor: badgeStyle.bg, borderColor: badgeStyle.border },
            ]}
          >
            <Text style={[styles.statusBadgeText, { color: badgeStyle.text }]}>
              {item.status.replace(/_/g, ' ').toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.min(item.progress || 20, 100)}%` }]} />
            </View>
            <Text style={styles.progressLabel}>{item.progress || 20}%</Text>
          </View>

          <View style={styles.cardActionRow}>
            <View style={styles.deadlinePill}>
              <View style={styles.greenDot} />
              <Text style={styles.deadlineText}>On Track</Text>
            </View>

            <View style={styles.actionRight}>
              {item.unreadCount ? item.unreadCount > 0 ? (
                <View style={styles.unreadPill}>
                  <Text style={styles.unreadPillText}>{item.unreadCount} new</Text>
                </View>
              ) : null : null}

              <TouchableOpacity
                style={styles.chatActionBtn}
                onPress={() => onSelectProject(item.id, item.title, item.clientName)}
                activeOpacity={0.8}
              >
                <MessageSquare size={13} color="#000704" strokeWidth={2.4} />
                <Text style={styles.chatActionText}>Chat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ImageBackground
      source={require('../../assets/banner1.png')}
      style={styles.fullBg}
      resizeMode="cover"
    >
      <View style={styles.ambientOverlay}>
        {/* Topbar */}
        <View style={styles.topbar}>
          <Image
            source={require('../../assets/FLOXA_log.png')}
            style={styles.topbarLogo}
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
              style={styles.newBtn}
              onPress={() => setIsWizardOpen(true)}
              activeOpacity={0.8}
            >
              <Plus size={14} color="#000704" strokeWidth={2.6} />
              <Text style={styles.newBtnText}>New Project</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Bar (Matching Web ProjectSection.js) */}
        <View style={styles.searchBarWrap}>
          <Search size={16} color="#89aca0" strokeWidth={2} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by project, client, or company..."
            placeholderTextColor={THEME.textPlaceholder}
            value={searchQuery}
            onChangeText={handleSearchChange}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearchChange('')}>
              <X size={16} color="#89aca0" strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Chips Bar */}
        <View style={styles.filterBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {STATUS_FILTERS.map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
                onPress={() => handleSelectFilter(f)}
              >
                <Text style={[styles.filterChipText, activeFilter === f && styles.filterChipTextActive]}>
                  {f}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Main List */}
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={THEME.neon} />
            <Text style={styles.loadingText}>Syncing projects...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchProjects}>
              <Text style={styles.retryBtnText}>Retry Connection</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={filteredProjects}
            keyExtractor={(item) => item.id}
            renderItem={renderProjectItem}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={THEME.neon} />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>No Projects Found</Text>
                <Text style={styles.emptySubtitle}>
                  {searchQuery
                    ? `No matches for "${searchQuery}"`
                    : activeFilter === 'All'
                    ? 'Tap "New Project" above to create your first client portal.'
                    : `No projects currently in "${activeFilter}" stage.`}
                </Text>
              </View>
            }
          />
        )}

        {/* Project Details Modal */}
        <ProjectDetailModal
          visible={Boolean(selectedProject)}
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
          onOpenChat={onSelectProject}
          onStartCall={(isVideo) => {
            if (onStartCall) onStartCall(isVideo);
          }}
          onOpenPortal={onOpenPortal}
        />

        {/* Project Creation Wizard Modal */}
        <ProjectCreateWizardModal
          visible={isWizardOpen}
          onClose={() => setIsWizardOpen(false)}
          onProjectCreated={() => {
            fetchProjects();
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(4, 20, 13, 0.72)',
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  topbarLogo: {
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
  newBtn: {
    backgroundColor: THEME.neon,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  newBtnText: {
    color: THEME.textDark,
    fontSize: 12,
    fontWeight: '800',
  },
  searchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(4, 20, 13, 0.65)',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: THEME.border,
    borderTopColor: THEME.borderGlassTop,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: THEME.text,
    fontSize: 13,
  },
  clearSearch: {
    color: THEME.textMuted,
    fontSize: 14,
    paddingHorizontal: 4,
  },
  filterBar: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(77, 255, 160, 0.08)',
    backgroundColor: '#030d08',
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(77, 255, 160, 0.15)',
    borderColor: THEME.neon,
  },
  filterChipText: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: THEME.neon,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: THEME.bgCard,
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  titleWrap: {
    flex: 1,
    marginRight: 8,
  },
  projectTitle: {
    color: THEME.text,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  clientSubtitle: {
    color: THEME.textMuted,
    fontSize: 13,
    marginTop: 3,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardBody: {},
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: '#020806',
    borderRadius: 3,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: THEME.neon,
  },
  progressLabel: {
    color: THEME.neon,
    fontSize: 12,
    fontWeight: '700',
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  deadlinePill: {
    backgroundColor: 'rgba(77, 255, 160, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.neon,
  },
  deadlineText: {
    color: THEME.neon,
    fontSize: 11,
    fontWeight: '600',
  },
  actionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unreadPill: {
    backgroundColor: THEME.danger,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  unreadPillText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  chatActionBtn: {
    backgroundColor: THEME.neon,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 7,
  },
  chatActionText: {
    color: THEME.textDark,
    fontSize: 12,
    fontWeight: '800',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: THEME.textMuted,
    marginTop: 12,
    fontSize: 13,
  },
  errorBox: {
    margin: 20,
    padding: 16,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.danger,
    alignItems: 'center',
  },
  errorText: {
    color: THEME.danger,
    fontSize: 13,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 10,
    backgroundColor: THEME.neon,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryBtnText: {
    color: THEME.textDark,
    fontWeight: '700',
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    color: THEME.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
