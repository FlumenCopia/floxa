import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
  ImageBackground,
  Alert,
} from 'react-native';
import {
  Compass,
  Palette,
  Sparkles,
  FileText,
  Folder,
  CreditCard,
  User,
  Check,
  Clock,
  ArrowRight,
  MessageSquare,
  Video,
  LogOut,
  Send,
  X,
  Building,
  Type,
  MapPin,
  Globe,
  Phone,
  Mail,
} from 'lucide-react-native';
import { api } from '../services/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { ClientProjectUser } from '../types';
import { THEME } from '../constants/theme';
import { DiscoverySurveyModal } from '../components/DiscoverySurveyModal';
import { FontSelectionModal } from '../components/FontSelectionModal';
import { ClientProfileModal } from '../components/ClientProfileModal';

interface ClientPortalScreenProps {
  onOpenChat: () => void;
  onStartCall: (isVideo: boolean) => void;
  customPortalToken?: string;
  onExitPreview?: () => void;
}

type PortalTab =
  | 'overview'
  | 'profile'
  | 'moodboards'
  | 'concepts'
  | 'agreement'
  | 'deliverables'
  | 'payments'
  | 'consultant';

export const ClientPortalScreen: React.FC<ClientPortalScreenProps> = ({
  onOpenChat,
  onStartCall,
  customPortalToken,
  onExitPreview,
}) => {
  const insets = useSafeAreaInsets();
  const { user, portalToken: contextToken, logout } = useAuth();
  const portalToken = customPortalToken || contextToken;
  const clientUser = user as ClientProjectUser | null;

  const [activeTab, setActiveTab] = useState<PortalTab>('overview');
  const [projectData, setProjectData] = useState<any>(null);
  const [brandDNA, setBrandDNA] = useState<any>(null);
  const [moodboards, setMoodboards] = useState<any[]>([]);
  const [concepts, setConcepts] = useState<any[]>([]);
  const [agreement, setAgreement] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);
  const [isFontModalOpen, setIsFontModalOpen] = useState(false);
  const [selectedFontName, setSelectedFontName] = useState('Plus Jakarta Sans');

  // Client Profile modal state
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [clientProfile, setClientProfile] = useState<any>(null);

  // Inline feedback states
  const [feedbackMoodboardId, setFeedbackMoodboardId] = useState<string | null>(null);
  const [moodboardFeedbackText, setMoodboardFeedbackText] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  const [feedbackConceptId, setFeedbackConceptId] = useState<string | null>(null);
  const [conceptFeedbackText, setConceptFeedbackText] = useState('');

  const fetchAllPortalData = useCallback(async () => {
    if (!portalToken) return;
    try {
      const [projRes, dnaRes, mbRes, cpRes, agRes, payRes] = await Promise.all([
        api.get(`/client-portal/${portalToken}/`).catch(() => ({ data: null })),
        api.get(`/client-portal/${portalToken}/brand-dna/`).catch(() => ({ data: null })),
        api.get(`/client-portal/${portalToken}/moodboards/`).catch(() => ({ data: [] })),
        api.get(`/client-portal/${portalToken}/concepts/`).catch(() => ({ data: [] })),
        api.get(`/client-portal/${portalToken}/agreement/`).catch(() => ({ data: null })),
        api.get(`/client-portal/${portalToken}/payments/`).catch(() => ({ data: [] })),
      ]);

      if (projRes.data) {
        setProjectData(projRes.data);
        const pid = projRes.data?.id || projRes.data?._id;
        if (pid) {
          api.get(`/projects/${pid}/client-profile/`, {
            headers: { 'X-Client-Portal-Token': portalToken },
          })
          .then((pRes) => {
            if (pRes.data) setClientProfile(pRes.data);
          })
          .catch(() => {});
        }
      }
      if (dnaRes.data) {
        setBrandDNA(dnaRes.data.brandDNA || dnaRes.data);
      }
      setMoodboards(Array.isArray(mbRes.data) ? mbRes.data : projRes.data?.moodboards || []);
      setConcepts(Array.isArray(cpRes.data) ? cpRes.data : projRes.data?.concepts || []);
      setAgreement(agRes.data?.agreement || agRes.data);
      setPayments(Array.isArray(payRes.data) ? payRes.data : projRes.data?.payments || []);
    } catch (err: any) {
      console.warn('Failed to fetch client portal data:', err.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [portalToken]);

  useEffect(() => {
    fetchAllPortalData();
  }, [fetchAllPortalData]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchAllPortalData();
  };

  // Actions
  const handleSelectMoodboard = async (moodboardId: string) => {
    try {
      await api.post(`/client-portal/${portalToken}/moodboards/${moodboardId}/select/`);
      Alert.alert('Direction Selected', 'Your consultant has been notified of your chosen visual direction.');
      fetchAllPortalData();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || err.message);
    }
  };

  const handleSubmitMoodboardFeedback = async (moodboardId: string) => {
    if (!moodboardFeedbackText.trim()) {
      Alert.alert('Feedback Required', 'Please enter your requested refinements.');
      return;
    }
    setIsSubmittingFeedback(true);
    try {
      await api.post(`/client-portal/${portalToken}/moodboards/${moodboardId}/feedback/`, {
        feedback: moodboardFeedbackText,
      });
      Alert.alert('Feedback Sent', 'Your notes have been sent to your brand consultant.');
      setFeedbackMoodboardId(null);
      setMoodboardFeedbackText('');
      fetchAllPortalData();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || err.message);
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleApproveConcept = async (conceptId: string) => {
    Alert.alert(
      'Approve Concept',
      'Are you sure you want to approve this brand concept direction?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            try {
              await api.post(`/client-portal/${portalToken}/concepts/${conceptId}/feedback/`, {
                action: 'approved',
              });
              Alert.alert('Concept Approved', 'Design approved! Your consultant will proceed with deliverables.');
              fetchAllPortalData();
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.detail || err.message);
            }
          },
        },
      ]
    );
  };

  const handleSubmitConceptFeedback = async (conceptId: string) => {
    if (!conceptFeedbackText.trim()) {
      Alert.alert('Feedback Required', 'Please enter your revision notes.');
      return;
    }
    setIsSubmittingFeedback(true);
    try {
      await api.post(`/client-portal/${portalToken}/concepts/${conceptId}/feedback/`, {
        action: 'changes_requested',
        feedback: conceptFeedbackText,
      });
      Alert.alert('Revisions Requested', 'Your consultant will review your feedback and update the concepts.');
      setFeedbackConceptId(null);
      setConceptFeedbackText('');
      fetchAllPortalData();
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail || err.message);
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleAcceptAgreement = async () => {
    Alert.alert(
      'Accept Brand Agreement',
      'By accepting, you confirm the project scope, timeline, and deliverables.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept Agreement',
          onPress: async () => {
            try {
              await api.post(`/client-portal/${portalToken}/generated-agreement/accept/`);
              Alert.alert('Agreement Signed', 'Project agreement has been activated successfully!');
              fetchAllPortalData();
            } catch (err: any) {
              Alert.alert('Error', err.response?.data?.detail || err.message);
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color={THEME.neon} />
        <Text style={styles.loadingText}>Loading your Brand Workspace...</Text>
      </View>
    );
  }

  const deliverables = projectData?.deliverables || [];
  const currentStage = (projectData?.status || 'discovery').replace(/_/g, ' ').toUpperCase();
  const progressPct = projectData?.progress || projectData?.completionPct || 35;

  return (
    <ImageBackground
      source={require('../../assets/banner1.png')}
      style={styles.fullBg}
      resizeMode="cover"
    >
      <View style={styles.ambientOverlay}>
        {/* Top Header */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
          <View style={styles.headerBrand}>
            <Image
              source={require('../../assets/FLOXA_log.png')}
              style={styles.logoImg}
              resizeMode="contain"
            />
            <View style={styles.portalBadge}>
              <Text style={styles.portalBadgeText}>CLIENT PORTAL</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.exitBtn}
            onPress={onExitPreview || logout}
            activeOpacity={0.8}
          >
            {onExitPreview ? (
              <>
                <X size={13} color="#ff6b6b" strokeWidth={2.4} />
                <Text style={styles.exitBtnText}>Exit Preview</Text>
              </>
            ) : (
              <>
                <LogOut size={13} color="#ff6b6b" strokeWidth={2.2} />
                <Text style={styles.exitBtnText}>Exit</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Hero Banner */}
        <View style={styles.heroBanner}>
          <Text style={styles.companyName}>
            {projectData?.company_name || clientUser?.companyName || 'Welcome'}
          </Text>
          <Text style={styles.projectHeroTitle}>
            {projectData?.title || clientUser?.projectTitle || 'Brand Identity'}
          </Text>

          <View style={styles.stagePillWrap}>
            <View style={styles.stageDot} />
            <Text style={styles.stagePillText}>STAGE: {currentStage}</Text>
          </View>
        </View>

        {/* Horizontal Navigation Tabs */}
        <View style={styles.tabsBarWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'overview' && styles.tabItemActive]}
              onPress={() => setActiveTab('overview')}
            >
              <Compass size={14} color={activeTab === 'overview' ? THEME.neon : THEME.textMuted} strokeWidth={2} />
              <Text style={[styles.tabText, activeTab === 'overview' && styles.tabTextActive]}>Overview</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'profile' && styles.tabItemActive]}
              onPress={() => setActiveTab('profile')}
            >
              <Building size={14} color={activeTab === 'profile' ? THEME.neon : THEME.textMuted} strokeWidth={2} />
              <Text style={[styles.tabText, activeTab === 'profile' && styles.tabTextActive]}>Profile</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'moodboards' && styles.tabItemActive]}
              onPress={() => setActiveTab('moodboards')}
            >
              <Palette size={14} color={activeTab === 'moodboards' ? THEME.neon : THEME.textMuted} strokeWidth={2} />
              <Text style={[styles.tabText, activeTab === 'moodboards' && styles.tabTextActive]}>
                Moodboards ({moodboards.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'concepts' && styles.tabItemActive]}
              onPress={() => setActiveTab('concepts')}
            >
              <Sparkles size={14} color={activeTab === 'concepts' ? THEME.neon : THEME.textMuted} strokeWidth={2} />
              <Text style={[styles.tabText, activeTab === 'concepts' && styles.tabTextActive]}>
                Concepts ({concepts.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'agreement' && styles.tabItemActive]}
              onPress={() => setActiveTab('agreement')}
            >
              <FileText size={14} color={activeTab === 'agreement' ? THEME.neon : THEME.textMuted} strokeWidth={2} />
              <Text style={[styles.tabText, activeTab === 'agreement' && styles.tabTextActive]}>Agreement</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'deliverables' && styles.tabItemActive]}
              onPress={() => setActiveTab('deliverables')}
            >
              <Folder size={14} color={activeTab === 'deliverables' ? THEME.neon : THEME.textMuted} strokeWidth={2} />
              <Text style={[styles.tabText, activeTab === 'deliverables' && styles.tabTextActive]}>
                Assets ({deliverables.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'payments' && styles.tabItemActive]}
              onPress={() => setActiveTab('payments')}
            >
              <CreditCard size={14} color={activeTab === 'payments' ? THEME.neon : THEME.textMuted} strokeWidth={2} />
              <Text style={[styles.tabText, activeTab === 'payments' && styles.tabTextActive]}>Payments</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, activeTab === 'consultant' && styles.tabItemActive]}
              onPress={() => setActiveTab('consultant')}
            >
              <User size={14} color={activeTab === 'consultant' ? THEME.neon : THEME.textMuted} strokeWidth={2} />
              <Text style={[styles.tabText, activeTab === 'consultant' && styles.tabTextActive]}>Consultant</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + insets.bottom }]}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={THEME.neon} />
          }
        >
          {/* ============================================================
              TAB 1: OVERVIEW & BRAND DNA
              ============================================================ */}
          {activeTab === 'overview' && (
            <View>
              {/* Milestone Progress Card */}
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardTitle}>Project Milestone</Text>
                  <Text style={styles.progressPercent}>{progressPct}%</Text>
                </View>

                <View style={styles.progressBarTrack}>
                  <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
                </View>

                <Text style={styles.milestoneNote}>
                  Phase: {currentStage} • Your assigned strategist is crafting deliverables.
                </Text>
              </View>

              {/* Company Profile Card */}
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Building size={16} color={THEME.neon} strokeWidth={2.2} />
                    <Text style={styles.cardTitle}>Company Profile</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.editProfileBtnSmall}
                    onPress={() => setIsProfileModalOpen(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.editProfileBtnSmallText}>Edit Details</Text>
                    <ArrowRight size={12} color={THEME.textDark} strokeWidth={2.4} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.companySummaryText}>
                  {clientProfile?.companyName || projectData?.company_name || clientUser?.companyName || 'Your Brand'} • {clientProfile?.industry || projectData?.sector || 'Brand Identity'}
                </Text>
                <Text style={styles.companyMetaRow}>
                  Location: {clientProfile?.location || 'Headquarters'} • Email: {clientProfile?.email || projectData?.clientEmail || 'Connected'}
                </Text>
              </View>

              {/* Discovery Intake Prompt */}
              {(!projectData?.has_discovery || !projectData?.discovery_completed) && (
                <View style={styles.discoveryPromptCard}>
                  <View style={styles.discoveryPromptHeader}>
                    <Sparkles size={18} color={THEME.neon} strokeWidth={2} />
                    <Text style={styles.discoveryPromptTitle}>Brand Discovery Questionnaire</Text>
                  </View>
                  <Text style={styles.discoveryPromptDesc}>
                    Complete your brand traits, audience archetypes, and spectrum sliders to empower your strategist.
                  </Text>
                  <TouchableOpacity
                    style={styles.openDiscoveryBtn}
                    onPress={() => setIsDiscoveryOpen(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.openDiscoveryBtnText}>Launch Discovery Intake</Text>
                    <ArrowRight size={14} color="#000704" strokeWidth={2.4} />
                  </TouchableOpacity>
                </View>
              )}

              {/* Brand DNA Strategy Card */}
              {brandDNA && (
                <View style={styles.card}>
                  <View style={styles.dnaHeaderRow}>
                    <Text style={styles.cardTitle}>Brand DNA & Strategy</Text>
                    <View style={styles.dnaBadge}>
                      <Text style={styles.dnaBadgeText}>{brandDNA.personalityCluster || 'Strategic Identity'}</Text>
                    </View>
                  </View>

                  {brandDNA.positioningStatement ? (
                    <View style={styles.dnaSection}>
                      <Text style={styles.dnaLabel}>POSITIONING STRATEGY</Text>
                      <Text style={styles.dnaText}>{brandDNA.positioningStatement}</Text>
                    </View>
                  ) : null}

                  {/* Color Palette Swatches */}
                  {Array.isArray(brandDNA.colorPalette) && brandDNA.colorPalette.length > 0 && (
                    <View style={styles.dnaSection}>
                      <Text style={styles.dnaLabel}>CURATED COLOR PALETTE</Text>
                      <View style={styles.paletteRow}>
                        {brandDNA.colorPalette.map((c: any, idx: number) => (
                          <View key={idx} style={styles.swatchCard}>
                            <View style={[styles.swatchBox, { backgroundColor: c.hex || '#ffffff' }]} />
                            <Text style={styles.swatchName} numberOfLines={1}>{c.name || c.role || 'Tone'}</Text>
                            <Text style={styles.swatchHex}>{c.hex}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Brand Typography & Fonts */}
                  <View style={styles.dnaSection}>
                    <Text style={styles.dnaLabel}>PRIMARY BRAND TYPOGRAPHY</Text>
                    <TouchableOpacity
                      style={styles.fontSelectRow}
                      onPress={() => setIsFontModalOpen(true)}
                      activeOpacity={0.8}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Type size={16} color={THEME.neon} strokeWidth={2} />
                        <Text style={styles.selectedFontLabel}>{selectedFontName}</Text>
                      </View>
                      <View style={styles.changeFontPill}>
                        <Text style={styles.changeFontPillText}>Browse Fonts</Text>
                        <ArrowRight size={12} color={THEME.neon} strokeWidth={2.4} />
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Live Collaboration Actions */}
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Direct Collaboration</Text>

                <TouchableOpacity style={styles.actionCardRow} onPress={onOpenChat} activeOpacity={0.8}>
                  <View style={styles.actionIconWrap}>
                    <MessageSquare size={18} color={THEME.neon} strokeWidth={2} />
                  </View>
                  <View style={styles.actionTextWrap}>
                    <Text style={styles.actionTitle}>Open Real-Time Chat</Text>
                    <Text style={styles.actionSubtitle}>Chat, send files, or voice notes with consultant</Text>
                  </View>
                  <ArrowRight size={15} color={THEME.neon} strokeWidth={2} />
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionCardRow} onPress={() => onStartCall(true)} activeOpacity={0.8}>
                  <View style={styles.actionIconWrap}>
                    <Video size={18} color={THEME.neon} strokeWidth={2} />
                  </View>
                  <View style={styles.actionTextWrap}>
                    <Text style={styles.actionTitle}>Start Video Consultation</Text>
                    <Text style={styles.actionSubtitle}>Connect directly via high-definition WebRTC call</Text>
                  </View>
                  <ArrowRight size={15} color={THEME.neon} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ============================================================
              TAB: COMPANY PROFILE
              ============================================================ */}
          {activeTab === 'profile' && (
            <View>
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Building size={18} color={THEME.neon} strokeWidth={2.4} />
                    <Text style={styles.cardTitle}>Company Profile</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.editProfileBtnSmall}
                    onPress={() => setIsProfileModalOpen(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.editProfileBtnSmallText}>Edit Profile</Text>
                    <ArrowRight size={12} color={THEME.textDark} strokeWidth={2.4} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.tabSectionDesc}>
                  Official brand credentials and collaboration coordinates shared with your assigned consultant.
                </Text>

                <View style={styles.profileDetailGrid}>
                  <View style={styles.profileDetailItem}>
                    <Text style={styles.profileDetailLabel}>CLIENT CONTACT</Text>
                    <Text style={styles.profileDetailValue}>
                      {clientProfile?.clientName || clientProfile?.client_name || projectData?.client?.name || 'Not specified'}
                    </Text>
                  </View>

                  <View style={styles.profileDetailItem}>
                    <Text style={styles.profileDetailLabel}>COMPANY / BRAND</Text>
                    <Text style={styles.profileDetailValue}>
                      {clientProfile?.companyName || clientProfile?.company_name || projectData?.company_name || 'Not specified'}
                    </Text>
                  </View>

                  <View style={styles.profileDetailItem}>
                    <Text style={styles.profileDetailLabel}>INDUSTRY SECTOR</Text>
                    <Text style={styles.profileDetailValue}>
                      {clientProfile?.industry || projectData?.sector || 'Technology / SaaS'}
                    </Text>
                  </View>

                  <View style={styles.profileDetailItem}>
                    <Text style={styles.profileDetailLabel}>YEAR FOUNDED</Text>
                    <Text style={styles.profileDetailValue}>
                      {clientProfile?.yearStarted || '2024'}
                    </Text>
                  </View>

                  <View style={styles.profileDetailItem}>
                    <Text style={styles.profileDetailLabel}>HEADQUARTERS</Text>
                    <Text style={styles.profileDetailValue}>
                      {clientProfile?.location || 'Remote / Global'}
                    </Text>
                  </View>

                  <View style={styles.profileDetailItem}>
                    <Text style={styles.profileDetailLabel}>BUSINESS EMAIL</Text>
                    <Text style={styles.profileDetailValue}>
                      {clientProfile?.email || projectData?.clientEmail || 'Connected'}
                    </Text>
                  </View>

                  <View style={styles.profileDetailItem}>
                    <Text style={styles.profileDetailLabel}>CONTACT PHONE</Text>
                    <Text style={styles.profileDetailValue}>
                      {clientProfile?.phone || 'Not specified'}
                    </Text>
                  </View>

                  <View style={styles.profileDetailItem}>
                    <Text style={styles.profileDetailLabel}>WEBSITE</Text>
                    <Text style={styles.profileDetailValue}>
                      {clientProfile?.website || 'Not specified'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* ============================================================
              TAB 2: MOODBOARDS
              ============================================================ */}
          {activeTab === 'moodboards' && (
            <View>
              <Text style={styles.tabSectionTitle}>Visual Directions & Moodboards</Text>
              <Text style={styles.tabSectionDesc}>
                Review your consultant's visual directions. Select your preferred direction or request refinements.
              </Text>

              {moodboards.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Moodboards In Preparation</Text>
                  <Text style={styles.emptySub}>Your consultant will upload curated visual moodboards shortly.</Text>
                </View>
              ) : (
                moodboards.map((item, idx) => {
                  const isSelected = item.clientSelected || item.is_selected || item.isSelected;
                  const isOpeningFeedback = feedbackMoodboardId === item.id || feedbackMoodboardId === item._id;

                  return (
                    <View key={item.id || item._id || idx} style={[styles.directionCard, isSelected && styles.directionCardSelected]}>
                      <View style={styles.directionHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.directionTitle}>{item.title || item.name || `Direction #${idx + 1}`}</Text>
                          {item.description ? <Text style={styles.directionDesc}>{item.description}</Text> : null}
                        </View>
                        {isSelected && (
                          <View style={styles.selectedBadge}>
                            <Check size={12} color="#000704" strokeWidth={3} />
                            <Text style={styles.selectedBadgeText}>SELECTED</Text>
                          </View>
                        )}
                      </View>

                      {/* Action Row */}
                      <View style={styles.directionBtnRow}>
                        {isSelected ? (
                          <View style={[styles.dirBtn, styles.dirBtnDisabled]}>
                            <Text style={styles.dirBtnTextDisabled}>Active Direction</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={[styles.dirBtn, styles.dirBtnSelect]}
                            onPress={() => handleSelectMoodboard(item.id || item._id)}
                            activeOpacity={0.8}
                          >
                            <Check size={13} color="#000704" strokeWidth={2.4} />
                            <Text style={styles.dirBtnTextSelect}>Select Direction</Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          style={[styles.dirBtn, styles.dirBtnFeedback]}
                          onPress={() => {
                            if (isOpeningFeedback) {
                              setFeedbackMoodboardId(null);
                            } else {
                              setFeedbackMoodboardId(item.id || item._id);
                            }
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.dirBtnTextFeedback}>Request Changes</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Inline Feedback Box */}
                      {isOpeningFeedback && (
                        <View style={styles.feedbackBox}>
                          <TextInput
                            style={styles.feedbackInput}
                            placeholder="Tell your consultant what to refine or change in this visual direction..."
                            placeholderTextColor={THEME.textPlaceholder}
                            value={moodboardFeedbackText}
                            onChangeText={setMoodboardFeedbackText}
                            multiline
                            numberOfLines={3}
                          />
                          <View style={styles.feedbackSubmitRow}>
                            <TouchableOpacity
                              style={styles.cancelFeedbackBtn}
                              onPress={() => setFeedbackMoodboardId(null)}
                            >
                              <Text style={styles.cancelFeedbackText}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.sendFeedbackBtn}
                              onPress={() => handleSubmitMoodboardFeedback(item.id || item._id)}
                              disabled={isSubmittingFeedback}
                            >
                              {isSubmittingFeedback ? (
                                <ActivityIndicator size="small" color="#000704" />
                              ) : (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Send size={13} color="#000704" strokeWidth={2.4} />
                                  <Text style={styles.sendFeedbackText}>Send Feedback</Text>
                                </View>
                              )}
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* ============================================================
              TAB 3: CONCEPTS
              ============================================================ */}
          {activeTab === 'concepts' && (
            <View>
              <Text style={styles.tabSectionTitle}>Brand Identity Concepts</Text>
              <Text style={styles.tabSectionDesc}>
                Review identity design presentations. Approve your finalized concept or request revisions.
              </Text>

              {concepts.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Concepts In Production</Text>
                  <Text style={styles.emptySub}>Your consultant will share design concepts here for review.</Text>
                </View>
              ) : (
                concepts.map((item, idx) => {
                  const isApproved = item.status === 'approved';
                  const isOpeningConceptFeedback = feedbackConceptId === item.id || feedbackConceptId === item._id;

                  return (
                    <View key={item.id || item._id || idx} style={[styles.directionCard, isApproved && styles.directionCardSelected]}>
                      <View style={styles.directionHeader}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.directionTitle}>{item.title || `Concept Route #${idx + 1}`}</Text>
                          <Text style={styles.conceptMeta}>
                            Version {item.version || 1} • {item.status ? item.status.replace(/_/g, ' ').toUpperCase() : 'SHARED'}
                          </Text>
                          {item.description ? <Text style={styles.directionDesc}>{item.description}</Text> : null}
                        </View>
                        {isApproved && (
                          <View style={styles.selectedBadge}>
                            <Check size={12} color="#000704" strokeWidth={3} />
                            <Text style={styles.selectedBadgeText}>APPROVED</Text>
                          </View>
                        )}
                      </View>

                      {/* Action Row */}
                      <View style={styles.directionBtnRow}>
                        {isApproved ? (
                          <View style={[styles.dirBtn, styles.dirBtnDisabled]}>
                            <Text style={styles.dirBtnTextDisabled}>Approved</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={[styles.dirBtn, styles.dirBtnSelect]}
                            onPress={() => handleApproveConcept(item.id || item._id)}
                            activeOpacity={0.8}
                          >
                            <Check size={13} color="#000704" strokeWidth={2.4} />
                            <Text style={styles.dirBtnTextSelect}>Approve Concept</Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          style={[styles.dirBtn, styles.dirBtnFeedback]}
                          onPress={() => {
                            if (isOpeningConceptFeedback) {
                              setFeedbackConceptId(null);
                            } else {
                              setFeedbackConceptId(item.id || item._id);
                            }
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.dirBtnTextFeedback}>Request Revisions</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Inline Revision Input */}
                      {isOpeningConceptFeedback && (
                        <View style={styles.feedbackBox}>
                          <TextInput
                            style={styles.feedbackInput}
                            placeholder="Detail the revisions or adjustments needed for this concept..."
                            placeholderTextColor={THEME.textPlaceholder}
                            value={conceptFeedbackText}
                            onChangeText={setConceptFeedbackText}
                            multiline
                            numberOfLines={3}
                          />
                          <View style={styles.feedbackSubmitRow}>
                            <TouchableOpacity
                              style={styles.cancelFeedbackBtn}
                              onPress={() => setFeedbackConceptId(null)}
                            >
                              <Text style={styles.cancelFeedbackText}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.sendFeedbackBtn}
                              onPress={() => handleSubmitConceptFeedback(item.id || item._id)}
                              disabled={isSubmittingFeedback}
                            >
                              {isSubmittingFeedback ? (
                                <ActivityIndicator size="small" color="#000704" />
                              ) : (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Send size={13} color="#000704" strokeWidth={2.4} />
                                  <Text style={styles.sendFeedbackText}>Submit Revisions</Text>
                                </View>
                              )}
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* ============================================================
              TAB 4: AGREEMENT
              ============================================================ */}
          {activeTab === 'agreement' && (
            <View>
              <Text style={styles.tabSectionTitle}>Client Engagement Agreement</Text>
              <Text style={styles.tabSectionDesc}>Review deliverables, IP transfer clauses, and project milestones.</Text>

              <View style={styles.card}>
                <View style={styles.agreementHeaderRow}>
                  <FileText size={20} color={THEME.neon} strokeWidth={2} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.agreementTitle}>{agreement?.title || 'Brand Consulting Engagement'}</Text>
                    <Text style={styles.agreementStatus}>
                      Status: {agreement?.status ? agreement.status.toUpperCase() : 'ACTIVE'}
                    </Text>
                  </View>
                  {agreement?.status === 'signed' ? (
                    <View style={styles.selectedBadge}>
                      <Check size={11} color="#000704" strokeWidth={3} />
                      <Text style={styles.selectedBadgeText}>SIGNED</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.agreementTermsBox}>
                  <Text style={styles.agreementTermsText}>
                    {agreement?.terms ||
                      '1. Scope: Execution of comprehensive Brand DNA, Moodboard directions, and Concept identity.\n2. IP: Full commercial intellectual property transfers upon final invoice clearance.\n3. Confidentiality: Mutual non-disclosure of strategic briefs and draft materials.'}
                  </Text>
                </View>

                {agreement?.status !== 'signed' && (
                  <TouchableOpacity
                    style={styles.acceptAgreementBtn}
                    onPress={handleAcceptAgreement}
                    activeOpacity={0.8}
                  >
                    <Check size={15} color="#000704" strokeWidth={2.6} />
                    <Text style={styles.acceptAgreementBtnText}>Sign & Accept Agreement</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* ============================================================
              TAB 5: ASSETS & DELIVERABLES
              ============================================================ */}
          {activeTab === 'deliverables' && (
            <View>
              <Text style={styles.tabSectionTitle}>Finalized Deliverables</Text>
              <Text style={styles.tabSectionDesc}>Download your production-ready vector assets, palettes & brand guidelines.</Text>

              {deliverables.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Deliverables In Final Assembly</Text>
                  <Text style={styles.emptySub}>Assets will appear here once finalized by your strategist.</Text>
                </View>
              ) : (
                deliverables.map((item: any, idx: number) => (
                  <View key={item._id || item.id || idx} style={styles.deliverableRow}>
                    <View style={styles.deliverableIconWrap}>
                      <Folder size={18} color={THEME.neon} strokeWidth={2} />
                    </View>
                    <View style={styles.deliverableInfo}>
                      <Text style={styles.deliverableName}>{item.title || item.name || 'Brand Package'}</Text>
                      <Text style={styles.deliverableStatus}>
                        {item.file_format || item.format || 'ZIP'} • {item.status || 'Ready for download'}
                      </Text>
                    </View>
                    <View style={styles.badgeApproved}>
                      <Check size={11} color={THEME.neon} strokeWidth={3} />
                      <Text style={styles.badgeApprovedText}>READY</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {/* ============================================================
              TAB 6: PAYMENTS
              ============================================================ */}
          {activeTab === 'payments' && (
            <View>
              <Text style={styles.tabSectionTitle}>Project Milestones & Billing</Text>
              <Text style={styles.tabSectionDesc}>Secured via Razorpay Payment Gateway integration.</Text>

              {payments.length === 0 ? (
                <View style={styles.card}>
                  <View style={styles.paymentRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.paymentType}>Advance Retainer (50%)</Text>
                      <Text style={styles.paymentAmount}>Rs 45,000</Text>
                    </View>
                    <View style={styles.badgePaid}>
                      <Check size={11} color="#000704" strokeWidth={3} />
                      <Text style={styles.badgePaidText}>PAID</Text>
                    </View>
                  </View>

                  <View style={[styles.paymentRow, { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.paymentType}>Final Delivery (50%)</Text>
                      <Text style={styles.paymentAmount}>Rs 45,000</Text>
                    </View>
                    <View style={styles.badgeLocked}>
                      <Clock size={11} color={THEME.textMuted} strokeWidth={2.4} />
                      <Text style={styles.badgeLockedText}>ON DELIVERY</Text>
                    </View>
                  </View>
                </View>
              ) : (
                payments.map((p, idx) => {
                  const isPaid = p.status === 'paid';

                  return (
                    <View key={p.id || idx} style={styles.card}>
                      <View style={styles.paymentRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.paymentType}>{p.title || `Milestone #${idx + 1}`}</Text>
                          <Text style={styles.paymentAmount}>Rs {Number(p.amount || 0).toLocaleString('en-IN')}</Text>
                        </View>
                        {isPaid ? (
                          <View style={styles.badgePaid}>
                            <Check size={11} color="#000704" strokeWidth={3} />
                            <Text style={styles.badgePaidText}>PAID</Text>
                          </View>
                        ) : (
                          <View style={styles.badgeLocked}>
                            <Clock size={11} color={THEME.textMuted} strokeWidth={2.4} />
                            <Text style={styles.badgeLockedText}>{p.status ? p.status.toUpperCase() : 'PENDING'}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* ============================================================
              TAB 7: CONSULTANT
              ============================================================ */}
          {activeTab === 'consultant' && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Assigned Brand Consultant</Text>

              <View style={styles.consultantProfileRow}>
                <View style={styles.consultantAvatarCircle}>
                  <Text style={styles.consultantAvatarText}>
                    {(clientUser?.consultantName || 'C').charAt(0).toUpperCase()}
                  </Text>
                </View>

                <View style={styles.consultantDetail}>
                  <Text style={styles.consultantFullTitle}>Lead Brand Strategist</Text>
                  <Text style={styles.consultantFullName}>
                    {clientUser?.consultantName || 'Floxa Consultant'}
                  </Text>
                  <Text style={styles.consultantBio}>
                    Dedicated to crafting your brand's unique identity, messaging, and visual system.
                  </Text>
                </View>
              </View>

              <View style={styles.consultantButtonsRow}>
                <TouchableOpacity style={styles.consultantBtn} onPress={onOpenChat} activeOpacity={0.8}>
                  <MessageSquare size={14} color={THEME.neon} strokeWidth={2.2} />
                  <Text style={styles.consultantBtnText}>Message Consultant</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.consultantBtn} onPress={() => onStartCall(true)} activeOpacity={0.8}>
                  <Video size={14} color={THEME.neon} strokeWidth={2.2} />
                  <Text style={styles.consultantBtnText}>Video Call</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Discovery Intake Modal */}
        <DiscoverySurveyModal
          visible={isDiscoveryOpen}
          portalToken={portalToken || ''}
          onClose={() => setIsDiscoveryOpen(false)}
          onSubmitted={() => {
            fetchAllPortalData();
          }}
        />

        {/* Font Selection Modal */}
        <FontSelectionModal
          visible={isFontModalOpen}
          portalToken={portalToken || ''}
          companyName={projectData?.company_name || clientUser?.companyName || 'Brand Identity'}
          currentFont={selectedFontName}
          onClose={() => setIsFontModalOpen(false)}
          onFontSelected={(newFont) => {
            setSelectedFontName(newFont);
            fetchAllPortalData();
          }}
        />

        {/* Client Profile Modal */}
        <ClientProfileModal
          visible={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          projectId={projectData?.id || projectData?._id || clientUser?.projectId || ''}
          portalToken={portalToken || undefined}
          initialProfile={clientProfile || projectData}
          onProfileUpdated={(updated) => {
            setClientProfile(updated);
            fetchAllPortalData();
          }}
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
  centerBox: {
    flex: 1,
    backgroundColor: THEME.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: THEME.textMuted,
    marginTop: 12,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(6, 22, 15, 0.85)',
    borderBottomWidth: 1,
    borderBottomColor: THEME.borderLight,
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoImg: {
    width: 90,
    height: 28,
  },
  portalBadge: {
    backgroundColor: 'rgba(77, 255, 160, 0.1)',
    borderWidth: 1,
    borderColor: THEME.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  portalBadgeText: {
    color: THEME.neon,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  exitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.3)',
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  exitBtnText: {
    color: THEME.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  heroBanner: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'rgba(6, 22, 15, 0.65)',
    borderBottomWidth: 1,
    borderBottomColor: THEME.borderLight,
  },
  companyName: {
    color: THEME.neon,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  projectHeroTitle: {
    color: THEME.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: 0.3,
  },
  stagePillWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#020806',
    borderWidth: 1,
    borderColor: THEME.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
    gap: 6,
  },
  stageDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.neon,
  },
  stagePillText: {
    color: THEME.neon,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tabsBarWrap: {
    backgroundColor: 'rgba(4, 16, 11, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: THEME.borderLight,
  },
  tabsScroll: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabItemActive: {
    backgroundColor: 'rgba(77, 255, 160, 0.12)',
    borderColor: THEME.border,
  },
  tabText: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: THEME.neon,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  tabSectionTitle: {
    color: THEME.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  tabSectionDesc: {
    color: THEME.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
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
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    color: THEME.text,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  progressPercent: {
    color: THEME.neon,
    fontSize: 14,
    fontWeight: '800',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#020806',
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: THEME.neon,
  },
  editProfileBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: THEME.neon,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  editProfileBtnSmallText: {
    color: THEME.textDark,
    fontSize: 11,
    fontWeight: '800',
  },
  companySummaryText: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
  },
  companyMetaRow: {
    color: THEME.textMuted,
    fontSize: 11.5,
    marginTop: 4,
  },
  profileDetailGrid: {
    marginTop: 10,
    gap: 12,
  },
  profileDetailItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  profileDetailLabel: {
    color: THEME.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  profileDetailValue: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: '600',
  },
  milestoneNote: {
    color: THEME.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  discoveryPromptCard: {
    backgroundColor: 'rgba(77, 255, 160, 0.08)',
    borderWidth: 1,
    borderColor: THEME.neon,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  discoveryPromptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  discoveryPromptTitle: {
    color: THEME.text,
    fontSize: 15,
    fontWeight: '700',
  },
  discoveryPromptDesc: {
    color: THEME.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  openDiscoveryBtn: {
    backgroundColor: THEME.neon,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  openDiscoveryBtnText: {
    color: THEME.textDark,
    fontSize: 13,
    fontWeight: '800',
  },
  dnaHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dnaBadge: {
    backgroundColor: 'rgba(77, 255, 160, 0.1)',
    borderWidth: 1,
    borderColor: THEME.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dnaBadgeText: {
    color: THEME.neon,
    fontSize: 10,
    fontWeight: '700',
  },
  dnaSection: {
    marginTop: 10,
  },
  dnaLabel: {
    color: THEME.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  dnaText: {
    color: THEME.text,
    fontSize: 13,
    lineHeight: 19,
  },
  fontSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#020806',
    borderWidth: 1,
    borderColor: 'rgba(77, 255, 160, 0.25)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  selectedFontLabel: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: '700',
  },
  changeFontPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(77, 255, 160, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  changeFontPillText: {
    color: THEME.neon,
    fontSize: 11,
    fontWeight: '700',
  },
  paletteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  swatchCard: {
    alignItems: 'center',
    backgroundColor: '#020806',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    padding: 6,
    width: 68,
  },
  swatchBox: {
    width: 44,
    height: 28,
    borderRadius: 5,
    marginBottom: 4,
  },
  swatchName: {
    color: THEME.text,
    fontSize: 9,
    fontWeight: '600',
  },
  swatchHex: {
    color: THEME.neon,
    fontSize: 9,
    fontFamily: 'monospace',
    marginTop: 1,
  },
  actionCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#020806',
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(77, 255, 160, 0.15)',
  },
  actionIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(77, 255, 160, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  actionTextWrap: {
    flex: 1,
  },
  actionTitle: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: '700',
  },
  actionSubtitle: {
    color: THEME.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  directionCard: {
    backgroundColor: THEME.bgCard,
    borderWidth: 1.2,
    borderColor: THEME.border,
    borderTopColor: THEME.borderGlassTop,
    borderBottomColor: THEME.borderGlassBottom,
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 5,
  },
  directionCardSelected: {
    borderColor: THEME.neon,
    borderTopColor: 'rgba(255, 255, 255, 0.35)',
    borderBottomColor: THEME.neon,
    backgroundColor: 'rgba(8, 28, 19, 0.85)',
  },
  directionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  directionTitle: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: '700',
  },
  conceptMeta: {
    color: THEME.neon,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  directionDesc: {
    color: THEME.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  selectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: THEME.neon,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  selectedBadgeText: {
    color: '#000704',
    fontSize: 10,
    fontWeight: '800',
  },
  directionBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  dirBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
  },
  dirBtnSelect: {
    backgroundColor: THEME.neon,
  },
  dirBtnTextSelect: {
    color: THEME.textDark,
    fontSize: 12,
    fontWeight: '800',
  },
  dirBtnDisabled: {
    backgroundColor: 'rgba(77, 255, 160, 0.15)',
    borderWidth: 1,
    borderColor: THEME.neon,
  },
  dirBtnTextDisabled: {
    color: THEME.neon,
    fontSize: 12,
    fontWeight: '700',
  },
  dirBtnFeedback: {
    backgroundColor: '#020806',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  dirBtnTextFeedback: {
    color: THEME.text,
    fontSize: 12,
    fontWeight: '600',
  },
  feedbackBox: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  feedbackInput: {
    backgroundColor: '#020806',
    borderWidth: 1,
    borderColor: THEME.borderLight,
    borderRadius: 8,
    padding: 10,
    color: THEME.text,
    fontSize: 12,
    textAlignVertical: 'top',
  },
  feedbackSubmitRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  cancelFeedbackBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cancelFeedbackText: {
    color: THEME.textMuted,
    fontSize: 12,
  },
  sendFeedbackBtn: {
    backgroundColor: THEME.neon,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 6,
  },
  sendFeedbackText: {
    color: THEME.textDark,
    fontSize: 12,
    fontWeight: '800',
  },
  agreementHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  agreementTitle: {
    color: THEME.text,
    fontSize: 15,
    fontWeight: '700',
  },
  agreementStatus: {
    color: THEME.neon,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  agreementTermsBox: {
    backgroundColor: '#020806',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  agreementTermsText: {
    color: THEME.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  acceptAgreementBtn: {
    backgroundColor: THEME.neon,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  acceptAgreementBtnText: {
    color: THEME.textDark,
    fontSize: 13,
    fontWeight: '800',
  },
  emptyCard: {
    backgroundColor: 'rgba(6, 22, 15, 0.7)',
    borderWidth: 1,
    borderColor: THEME.borderLight,
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    color: THEME.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySub: {
    color: THEME.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  deliverableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 22, 15, 0.88)',
    borderWidth: 1,
    borderColor: THEME.borderLight,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  deliverableIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(77, 255, 160, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  deliverableInfo: {
    flex: 1,
  },
  deliverableName: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: '600',
  },
  deliverableStatus: {
    color: THEME.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  badgeApproved: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(77, 255, 160, 0.12)',
    borderWidth: 1,
    borderColor: THEME.neon,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeApprovedText: {
    color: THEME.neon,
    fontSize: 10,
    fontWeight: '700',
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paymentType: {
    color: THEME.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  paymentAmount: {
    color: THEME.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  badgePaid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: THEME.neon,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgePaidText: {
    color: '#000704',
    fontSize: 10,
    fontWeight: '800',
  },
  badgeLocked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeLockedText: {
    color: THEME.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  consultantProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  consultantAvatarCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#005c4b',
    borderWidth: 2,
    borderColor: THEME.neon,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  consultantAvatarText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  consultantDetail: {
    flex: 1,
  },
  consultantFullTitle: {
    color: THEME.neon,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  consultantFullName: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  consultantBio: {
    color: THEME.textMuted,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
  },
  consultantButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  consultantBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#020806',
    borderWidth: 1,
    borderColor: THEME.neon,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  consultantBtnText: {
    color: THEME.neon,
    fontSize: 12,
    fontWeight: '700',
  },
});
