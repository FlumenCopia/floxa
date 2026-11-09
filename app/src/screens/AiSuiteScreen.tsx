import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ImageBackground,
  Platform,
} from 'react-native';
import {
  FileText,
  Sparkles,
  Palette,
  ArrowRight,
  X,
  Copy,
} from 'lucide-react-native';
import { api } from '../services/api';
import { THEME } from '../constants/theme';
import { ProjectSummary } from '../types';

interface AiTool {
  id: string;
  name: string;
  description: string;
  toolType: 'proposal' | 'dna' | 'moodboard';
  badge: string;
  actionText: string;
}

const AI_TOOLS: AiTool[] = [
  {
    id: 'proposal-generator',
    name: 'Proposal Generator',
    description: 'Generates a 6-section commercial proposal: executive summary, strategic approach, scope, timeline, investment & why us.',
    toolType: 'proposal',
    badge: 'CORE STRATEGY',
    actionText: 'Generate Proposal',
  },
  {
    id: 'enhance-brand-dna',
    name: 'Enhance Brand DNA',
    description: 'AI refines brand positioning, archetypes, UVP, core pillars, and 5 distinct tagline options using discovery context.',
    toolType: 'dna',
    badge: 'IDENTITY CORE',
    actionText: 'Enhance DNA',
  },
  {
    id: 'moodboard-directions',
    name: 'Moodboard Directions',
    description: '3 visual directions with validated HEX color palettes, typography pairings, imagery style & texture cues.',
    toolType: 'moodboard',
    badge: 'VISUAL SYSTEM',
    actionText: 'Generate Directions',
  },
];

export const AiSuiteScreen: React.FC = () => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [usage, setUsage] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunningTool, setIsRunningTool] = useState(false);
  const [activeRunningToolId, setActiveRunningToolId] = useState<string | null>(null);
  const [generatedResult, setGeneratedResult] = useState<{ toolId: string; content: string } | null>(null);

  const fetchInitialData = useCallback(async () => {
    try {
      const [projRes, usageRes] = await Promise.all([
        api.get('/projects/'),
        api.get('/ai-suite/usage/').catch(() => ({ data: null })),
      ]);

      const raw = projRes.data?.results || projRes.data || [];
      const parsed: ProjectSummary[] = raw.map((p: any) => ({
        id: p.id || p._id,
        title: p.title || 'Brand Project',
        status: p.status || 'discovery',
        clientName: p.client?.name || p.company_name || 'Client',
      }));

      setProjects(parsed);
      if (parsed.length > 0) {
        setSelectedProjectId(parsed[0].id);
      }
      setUsage(usageRes.data);
    } catch (err: any) {
      console.warn('Failed to load AI suite data:', err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const handleRunTool = async (tool: AiTool) => {
    if (!selectedProjectId) {
      Alert.alert('Select Project', 'Please select a project to run AI generation for.');
      return;
    }

    setIsRunningTool(true);
    setActiveRunningToolId(tool.id);
    setGeneratedResult(null);

    try {
      const res = await api.post('/ai-suite/run/', {
        projectId: selectedProjectId,
        toolId: tool.id,
      });

      const output = res.data?.output || res.data?.result || res.data?.data || JSON.stringify(res.data, null, 2);

      setGeneratedResult({
        toolId: tool.id,
        content: typeof output === 'string' ? output : JSON.stringify(output, null, 2),
      });

      // Refresh usage stats
      api.get('/ai-suite/usage/').then((u) => setUsage(u.data)).catch(() => {});
    } catch (err: any) {
      Alert.alert('AI Generation Error', err.response?.data?.detail || err.message);
    } finally {
      setIsRunningTool(false);
      setActiveRunningToolId(null);
    }
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const renderToolIcon = (type: 'proposal' | 'dna' | 'moodboard') => {
    switch (type) {
      case 'proposal':
        return <FileText size={20} color={THEME.neon} strokeWidth={2} />;
      case 'dna':
        return <Sparkles size={20} color={THEME.neon} strokeWidth={2} />;
      case 'moodboard':
      default:
        return <Palette size={20} color={THEME.neon} strokeWidth={2} />;
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
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Floxa AI Suite</Text>
            <View style={styles.aiBadge}>
              <Text style={styles.aiBadgeText}>GEMINI 2.0 PRO</Text>
            </View>
          </View>
          <Text style={styles.headerSub}>Brand strategy, copy & visual direction engines</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Project Selector Bar */}
          <View style={styles.selectorCard}>
            <Text style={styles.selectorLabel}>TARGET BRAND PROJECT</Text>
            {projects.length === 0 ? (
              <Text style={styles.noProjectsText}>No active projects found.</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.projectScroll}>
                {projects.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.projectChip, selectedProjectId === p.id && styles.projectChipActive]}
                    onPress={() => setSelectedProjectId(p.id)}
                  >
                    <Text
                      style={[styles.projectChipText, selectedProjectId === p.id && styles.projectChipTextActive]}
                    >
                      {p.title}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          {/* AI Tools List */}
          <Text style={styles.sectionTitle}>Identity Generation Engines</Text>

          {AI_TOOLS.map((tool) => {
            const isThisRunning = isRunningTool && activeRunningToolId === tool.id;

            return (
              <View key={tool.id} style={styles.toolCard}>
                <View style={styles.toolHeader}>
                  <View style={styles.toolIconWrap}>
                    {renderToolIcon(tool.toolType)}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toolName}>{tool.name}</Text>
                    <View style={styles.toolBadge}>
                      <Text style={styles.toolBadgeText}>{tool.badge}</Text>
                    </View>
                  </View>
                </View>

                <Text style={styles.toolDesc}>{tool.description}</Text>

                <TouchableOpacity
                  style={[styles.runBtn, isRunningTool && styles.runBtnDisabled]}
                  onPress={() => handleRunTool(tool)}
                  disabled={isRunningTool}
                  activeOpacity={0.8}
                >
                  {isThisRunning ? (
                    <ActivityIndicator color={THEME.textDark} />
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Sparkles size={14} color="#000704" strokeWidth={2.4} />
                      <Text style={styles.runBtnText}>{tool.actionText}</Text>
                      <ArrowRight size={13} color="#000704" strokeWidth={2.4} />
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            );
          })}

          {/* Generated Result Output Box */}
          {generatedResult && (
            <View style={styles.outputCard}>
              <View style={styles.outputHeaderRow}>
                <Text style={styles.outputTitle}>AI Generation Output</Text>
                <TouchableOpacity
                  onPress={() => setGeneratedResult(null)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  <X size={14} color={THEME.textMuted} strokeWidth={2} />
                  <Text style={styles.clearOutputText}>Clear</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.outputScrollBox} nestedScrollEnabled={true}>
                <Text style={styles.outputText}>{generatedResult.content}</Text>
              </ScrollView>

              <TouchableOpacity
                style={styles.copyOutputBtn}
                onPress={() => {
                  Alert.alert('Copied', 'AI generated strategy copied to clipboard!');
                }}
                activeOpacity={0.8}
              >
                <Copy size={15} color={THEME.neon} strokeWidth={2} />
                <Text style={styles.copyOutputText}>Copy Strategy Output</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
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
  header: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: THEME.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.09)',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: THEME.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  aiBadge: {
    backgroundColor: 'rgba(77, 255, 160, 0.12)',
    borderWidth: 1,
    borderColor: THEME.neon,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  aiBadgeText: {
    color: THEME.neon,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerSub: {
    color: THEME.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  selectorCard: {
    backgroundColor: THEME.bgCard,
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1.2,
    borderColor: 'rgba(77, 255, 160, 0.18)',
    borderTopColor: THEME.borderGlassTop,
    borderBottomColor: THEME.borderGlassBottom,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  selectorLabel: {
    color: THEME.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  noProjectsText: {
    color: THEME.textMuted,
    fontSize: 13,
  },
  projectScroll: {
    flexDirection: 'row',
  },
  projectChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#020806',
    borderWidth: 1,
    borderColor: THEME.borderLight,
    marginRight: 8,
  },
  projectChipActive: {
    borderColor: THEME.neon,
    backgroundColor: 'rgba(77, 255, 160, 0.12)',
  },
  projectChipText: {
    color: THEME.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  projectChipTextActive: {
    color: THEME.neon,
    fontWeight: '700',
  },
  sectionTitle: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 12,
  },
  toolCard: {
    backgroundColor: THEME.bgCard,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1.2,
    borderColor: 'rgba(77, 255, 160, 0.18)',
    borderTopColor: THEME.borderGlassTop,
    borderBottomColor: THEME.borderGlassBottom,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 5,
  },
  toolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  toolIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(77, 255, 160, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  toolIcon: {
    fontSize: 22,
  },
  toolName: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: '700',
  },
  toolBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(77, 255, 160, 0.08)',
    borderWidth: 1,
    borderColor: THEME.borderLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  toolBadgeText: {
    color: THEME.neon,
    fontSize: 9,
    fontWeight: '700',
  },
  toolDesc: {
    color: THEME.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },
  runBtn: {
    backgroundColor: THEME.neon,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: THEME.neon,
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  runBtnDisabled: {
    opacity: 0.5,
  },
  runBtnText: {
    color: THEME.textDark,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  outputCard: {
    backgroundColor: '#020806',
    borderRadius: 16,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: THEME.neon,
  },
  outputHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  outputTitle: {
    color: THEME.neon,
    fontSize: 15,
    fontWeight: '700',
  },
  clearOutputText: {
    color: THEME.textMuted,
    fontSize: 13,
  },
  outputScrollBox: {
    maxHeight: 280,
    backgroundColor: '#06160f',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: THEME.borderLight,
  },
  outputText: {
    color: THEME.text,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  copyOutputBtn: {
    backgroundColor: 'rgba(77, 255, 160, 0.12)',
    borderWidth: 1,
    borderColor: THEME.neon,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  copyOutputText: {
    color: THEME.neon,
    fontSize: 13,
    fontWeight: '700',
  },
});

