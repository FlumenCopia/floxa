import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
  ImageBackground,
} from 'react-native';
import { MessageSquare } from 'lucide-react-native';
import { api } from '../services/api';
import { THEME } from '../constants/theme';
import { socketService } from '../services/socket';

interface ConversationItem {
  projectId: string;
  projectTitle: string;
  clientName: string;
  companyName?: string;
  portalToken?: string;
  unreadCount: number;
  isOnline: boolean;
  lastSeen?: string;
  lastMessage?: {
    id: string;
    text: string;
    senderRole?: string;
    createdAt?: string;
  } | null;
}

interface ChatListScreenProps {
  onSelectConversation: (projectId: string, projectTitle: string, clientName: string) => void;
}

export const ChatListScreen: React.FC<ChatListScreenProps> = ({ onSelectConversation }) => {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await api.get('/projects/chat/conversations/');
      const raw = res.data?.conversations || res.data || [];

      const parsed: ConversationItem[] = raw.map((c: any) => ({
        projectId: c.projectId || c.id || c._id,
        projectTitle: c.projectTitle || c.title || 'Brand Project',
        clientName: c.clientName || c.client?.name || 'Client',
        companyName: c.companyName || '',
        portalToken: c.portalToken,
        unreadCount: c.unreadCount || 0,
        isOnline: Boolean(c.isOnline),
        lastSeen: c.lastSeen,
        lastMessage: c.lastMessage || null,
      }));

      setConversations(parsed);
    } catch (err: any) {
      console.warn('Failed to load conversations:', err.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();

    // Listen for new incoming chat messages to refresh conversations list in real time
    const unbind = socketService.on('CHAT_MESSAGE_NEW', () => {
      fetchConversations();
    });

    return () => {
      unbind();
    };
  }, [fetchConversations]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchConversations();
  };

  const renderConversation = ({ item }: { item: ConversationItem }) => (
    <TouchableOpacity
      style={styles.chatRow}
      onPress={() => onSelectConversation(item.projectId, item.projectTitle, item.clientName)}
      activeOpacity={0.75}
    >
      {/* Avatar with Online Badge */}
      <View style={styles.avatarWrap}>
        <Text style={styles.avatarText}>{item.clientName.charAt(0).toUpperCase()}</Text>
        {item.isOnline && <View style={styles.onlineBadge} />}
      </View>

      {/* Middle: Name & Last Message */}
      <View style={styles.chatInfo}>
        <View style={styles.nameRow}>
          <Text style={styles.clientName} numberOfLines={1}>
            {item.clientName}
          </Text>
          <Text style={styles.timeText}>
            {item.lastMessage?.createdAt
              ? new Date(item.lastMessage.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : ''}
          </Text>
        </View>

        <Text style={styles.projectSubtitle} numberOfLines={1}>
          {item.projectTitle}
        </Text>

        <View style={styles.messageRow}>
          <Text
            style={[styles.lastMessageText, item.unreadCount > 0 && styles.lastMessageUnread]}
            numberOfLines={1}
          >
            {item.lastMessage?.text || 'No messages yet. Tap to start chatting.'}
          </Text>

          {item.unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{item.unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

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
            <MessageSquare size={20} color={THEME.neon} strokeWidth={2.2} />
            <Text style={styles.headerTitle}>Client Chats</Text>
            <View style={styles.totalBadge}>
              <Text style={styles.totalBadgeText}>{conversations.length}</Text>
            </View>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="small" color={THEME.neon} />
            <Text style={styles.loadingText}>Loading conversations...</Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.projectId}
            renderItem={renderConversation}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={THEME.neon} />
            }
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>No Conversations Yet</Text>
                <Text style={styles.emptySub}>
                  When clients message you or open their portal, their conversations will appear here.
                </Text>
              </View>
            }
          />
        )}
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
  totalBadge: {
    backgroundColor: 'rgba(77, 255, 160, 0.12)',
    borderWidth: 1,
    borderColor: THEME.neon,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  totalBadgeText: {
    color: THEME.neon,
    fontSize: 12,
    fontWeight: '700',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: THEME.textMuted,
    fontSize: 13,
    marginTop: 10,
  },
  listContent: {
    paddingVertical: 4,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: 'rgba(77, 255, 160, 0.16)',
    borderTopColor: THEME.borderGlassTop,
    borderBottomColor: THEME.borderGlassBottom,
    backgroundColor: THEME.bgCard,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 3,
  },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#005c4b',
    borderWidth: 1,
    borderColor: THEME.neon,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    position: 'relative',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: THEME.neon,
    borderWidth: 2,
    borderColor: THEME.bg,
  },
  chatInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  clientName: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  timeText: {
    color: THEME.textMuted,
    fontSize: 11,
  },
  projectSubtitle: {
    color: THEME.neon,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lastMessageText: {
    color: THEME.textMuted,
    fontSize: 13,
    flex: 1,
    marginRight: 10,
  },
  lastMessageUnread: {
    color: THEME.text,
    fontWeight: '600',
  },
  unreadBadge: {
    backgroundColor: THEME.neon,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  unreadText: {
    color: THEME.textDark,
    fontSize: 11,
    fontWeight: '800',
  },
  emptyBox: {
    padding: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySub: {
    color: THEME.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});

