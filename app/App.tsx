import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LayoutDashboard,
  FolderKanban,
  Sparkles,
  MessageSquare,
  Settings,
} from 'lucide-react-native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { AuthScreen } from './src/screens/AuthScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { ProjectsScreen } from './src/screens/ProjectsScreen';
import { AiSuiteScreen } from './src/screens/AiSuiteScreen';
import { ChatListScreen } from './src/screens/ChatListScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ClientPortalScreen } from './src/screens/ClientPortalScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { CallScreen } from './src/screens/CallScreen';
import { socketService } from './src/services/socket';
import { ClientProjectUser } from './src/types';
import { THEME } from './src/constants/theme';

interface ActiveChat {
  projectId: string;
  projectTitle: string;
  contactName: string;
}

interface ActiveCall {
  projectId: string;
  contactName: string;
  isVideo: boolean;
  isIncoming: boolean;
}

type ConsultantTab = 'dashboard' | 'projects' | 'ai' | 'chats' | 'settings';

function MainApp() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, role, user } = useAuth();
  const [activeTab, setActiveTab] = useState<ConsultantTab>('dashboard');
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [previewPortalToken, setPreviewPortalToken] = useState<string | null>(null);

  // Listen for incoming WebRTC calls over WebSocket
  useEffect(() => {
    if (!isAuthenticated) return;

    const unbindSignal = socketService.on('WEBRTC_SIGNAL', (payload: any) => {
      if (payload.action === 'call_initiate') {
        const callerRole = payload.sender_role || (role === 'consultant' ? 'client' : 'consultant');
        const callerName = callerRole === 'consultant' ? 'Brand Consultant' : 'Client';

        setActiveCall({
          projectId: payload.project_id,
          contactName: callerName,
          isVideo: Boolean(payload.data?.is_video),
          isIncoming: true,
        });
      }
    });

    return () => {
      unbindSignal();
    };
  }, [isAuthenticated, role]);

  if (isLoading) {
    return (
      <View style={styles.splashContainer}>
        <Image
          source={require('./assets/FLOXA_log.png')}
          style={styles.splashLogo}
          resizeMode="contain"
        />
        <ActivityIndicator size="small" color={THEME.neon} style={{ marginTop: 24 }} />
      </View>
    );
  }

  // Not logged in -> Show Brand Auth
  if (!isAuthenticated) {
    return <AuthScreen />;
  }

  // Active call screen takes precedence
  if (activeCall) {
    return (
      <CallScreen
        projectId={activeCall.projectId}
        contactName={activeCall.contactName}
        isVideo={activeCall.isVideo}
        isIncoming={activeCall.isIncoming}
        onEndCall={() => setActiveCall(null)}
      />
    );
  }

  // Active chat screen takes precedence
  if (activeChat) {
    return (
      <ChatScreen
        projectId={activeChat.projectId}
        projectTitle={activeChat.projectTitle}
        contactName={activeChat.contactName}
        onBack={() => setActiveChat(null)}
        onStartCall={(isVideo) => {
          setActiveCall({
            projectId: activeChat.projectId,
            contactName: activeChat.contactName,
            isVideo,
            isIncoming: false,
          });
        }}
      />
    );
  }

  // Client Portal Mode
  if (role === 'client') {
    const clientUser = user as ClientProjectUser | null;
    const projId = clientUser?.projectId || 'active-project';
    const projTitle = clientUser?.projectTitle || 'Your Brand Project';
    const consultantName = clientUser?.consultantName || 'Brand Consultant';

    return (
      <ClientPortalScreen
        onOpenChat={() => {
          setActiveChat({
            projectId: projId,
            projectTitle: projTitle,
            contactName: consultantName,
          });
        }}
        onStartCall={(isVideo) => {
          setActiveCall({
            projectId: projId,
            contactName: consultantName,
            isVideo,
            isIncoming: false,
          });
        }}
      />
    );
  }

  // Preview Client Portal in Consultant Workspace
  if (previewPortalToken) {
    return (
      <ClientPortalScreen
        customPortalToken={previewPortalToken}
        onExitPreview={() => setPreviewPortalToken(null)}
        onOpenChat={() => {
          setActiveChat({
            projectId: previewPortalToken,
            projectTitle: 'Client Workspace',
            contactName: 'Client',
          });
        }}
        onStartCall={(isVideo) => {
          setActiveCall({
            projectId: previewPortalToken,
            contactName: 'Client',
            isVideo,
            isIncoming: false,
          });
        }}
      />
    );
  }

  // Consultant Mode with 5-Tab Bottom Navigation Bar
  return (
    <View style={[styles.consultantShell, { paddingTop: insets.top }]}>
      {/* Screen Body */}
      <View style={styles.tabContent}>
        {activeTab === 'dashboard' && (
          <DashboardScreen
            onOpenProject={(projectId, projectTitle, clientName) => {
              setActiveChat({ projectId, projectTitle, contactName: clientName });
            }}
            onNavigateToProjects={() => setActiveTab('projects')}
          />
        )}

        {activeTab === 'projects' && (
          <ProjectsScreen
            onSelectProject={(projectId, projectTitle, clientName) => {
              setActiveChat({ projectId, projectTitle, contactName: clientName });
            }}
            onStartCall={(isVideo) => {
              setActiveCall({
                projectId: 'active-consultation',
                contactName: 'Client',
                isVideo,
                isIncoming: false,
              });
            }}
            onOpenPortal={(token) => setPreviewPortalToken(token)}
          />
        )}

        {activeTab === 'ai' && <AiSuiteScreen />}

        {activeTab === 'chats' && (
          <ChatListScreen
            onSelectConversation={(projectId, projectTitle, clientName) => {
              setActiveChat({ projectId, projectTitle, contactName: clientName });
            }}
          />
        )}

        {activeTab === 'settings' && <SettingsScreen />}
      </View>

      {/* Floxa Bottom Navigation Bar */}
      <View
        style={[
          styles.bottomNav,
          {
            paddingBottom: Math.max(insets.bottom, 6),
            height: 56 + Math.max(insets.bottom, 6),
          },
        ]}
      >
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('dashboard')}
          activeOpacity={0.7}
        >
          <LayoutDashboard
            size={20}
            color={activeTab === 'dashboard' ? THEME.neon : THEME.textMuted}
            strokeWidth={activeTab === 'dashboard' ? 2.3 : 1.8}
          />
          <Text style={[styles.navLabel, activeTab === 'dashboard' && styles.navLabelActive]}>
            Home
          </Text>
          {activeTab === 'dashboard' && <View style={styles.activeDot} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('projects')}
          activeOpacity={0.7}
        >
          <FolderKanban
            size={20}
            color={activeTab === 'projects' ? THEME.neon : THEME.textMuted}
            strokeWidth={activeTab === 'projects' ? 2.3 : 1.8}
          />
          <Text style={[styles.navLabel, activeTab === 'projects' && styles.navLabelActive]}>
            Projects
          </Text>
          {activeTab === 'projects' && <View style={styles.activeDot} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('ai')}
          activeOpacity={0.7}
        >
          <Sparkles
            size={20}
            color={activeTab === 'ai' ? THEME.neon : THEME.textMuted}
            strokeWidth={activeTab === 'ai' ? 2.3 : 1.8}
          />
          <Text style={[styles.navLabel, activeTab === 'ai' && styles.navLabelActive]}>
            AI Suite
          </Text>
          {activeTab === 'ai' && <View style={styles.activeDot} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('chats')}
          activeOpacity={0.7}
        >
          <MessageSquare
            size={20}
            color={activeTab === 'chats' ? THEME.neon : THEME.textMuted}
            strokeWidth={activeTab === 'chats' ? 2.3 : 1.8}
          />
          <Text style={[styles.navLabel, activeTab === 'chats' && styles.navLabelActive]}>
            Chats
          </Text>
          {activeTab === 'chats' && <View style={styles.activeDot} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => setActiveTab('settings')}
          activeOpacity={0.7}
        >
          <Settings
            size={20}
            color={activeTab === 'settings' ? THEME.neon : THEME.textMuted}
            strokeWidth={activeTab === 'settings' ? 2.3 : 1.8}
          />
          <Text style={[styles.navLabel, activeTab === 'settings' && styles.navLabelActive]}>
            Settings
          </Text>
          {activeTab === 'settings' && <View style={styles.activeDot} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: THEME.bg }}>
        <StatusBar style="light" />
        <AuthProvider>
          <MainApp />
        </AuthProvider>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: THEME.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: {
    width: 220,
    height: 70,
  },
  consultantShell: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  tabContent: {
    flex: 1,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: 'rgba(2, 14, 9, 0.96)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
    paddingTop: 6,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  navLabel: {
    color: THEME.textMuted,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  navLabelActive: {
    color: THEME.neon,
    fontWeight: '800',
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: THEME.neon,
    marginTop: 2,
  },
});
