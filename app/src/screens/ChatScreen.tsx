import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  ImageBackground,
} from 'react-native';
import {
  ArrowLeft,
  Phone,
  Video,
  Paperclip,
  Send,
  Mic,
  CheckCheck,
  Play,
  Pause,
  Square,
  Volume2,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { AudioService } from '../services/audio';
import { PermissionService, FloxaPermissionType } from '../services/permissions';
import { PermissionModal } from '../components/PermissionModal';
import { api, API_BASE_URL } from '../services/api';
import { socketService } from '../services/socket';
import { useAuth } from '../context/AuthContext';
import { ChatMessage } from '../types';
import { THEME } from '../constants/theme';

interface ChatScreenProps {
  projectId: string;
  projectTitle: string;
  contactName: string;
  onBack: () => void;
  onStartCall: (isVideo: boolean) => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  projectId,
  projectTitle,
  contactName,
  onBack,
  onStartCall,
}) => {
  const insets = useSafeAreaInsets();
  const { role, portalToken } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState<any>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [activeSound, setActiveSound] = useState<any>(null);
  const [permissionModalState, setPermissionModalState] = useState<{
    visible: boolean;
    type: FloxaPermissionType;
    isBlocked: boolean;
  }>({
    visible: false,
    type: 'camera',
    isBlocked: false,
  });

  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<any>(null);
  const recordingTimerRef = useRef<any>(null);

  const handleTogglePlayAudio = async (messageId: string, audioUrl?: string, duration: number = 5) => {
    if (playingAudioId === messageId) {
      if (activeSound) {
        try {
          await activeSound.stopAsync();
        } catch {}
      }
      setPlayingAudioId(null);
      return;
    }

    if (activeSound) {
      try {
        await activeSound.stopAsync();
      } catch {}
    }

    setPlayingAudioId(messageId);

    if (audioUrl && AudioService.isSupported()) {
      const fullUrl = audioUrl.startsWith('http')
        ? audioUrl
        : `${API_BASE_URL.replace('/api', '')}${audioUrl}`;
      const sound = await AudioService.playSoundAsync(fullUrl);
      if (sound) {
        setActiveSound(sound);
        sound.setOnPlaybackStatusUpdate((status: any) => {
          if (status.didJustFinish) {
            setPlayingAudioId(null);
            setActiveSound(null);
          }
        });
        return;
      }
    }

    // Playback duration simulation
    const playMs = Math.max(duration || 4, 2) * 1000;
    setTimeout(() => {
      setPlayingAudioId((curr) => (curr === messageId ? null : curr));
    }, playMs);
  };

  const fetchMessages = useCallback(async () => {
    try {
      let endpoint = `/projects/${projectId}/messages/?limit=100`;
      if (role === 'client' && portalToken) {
        endpoint = `/client-portal/${portalToken}/messages/?limit=100`;
      }
      const res = await api.get(endpoint);
      const raw = res.data?.results || res.data || [];

      const parsed: ChatMessage[] = raw.map((m: any) => ({
        id: m.id || m._id || String(Math.random()),
        projectId: m.project_id || projectId,
        senderRole: m.sender_role || m.senderRole || 'system',
        senderName: m.sender_name || m.senderName || 'Member',
        text: m.text || m.content || '',
        attachment: m.attachment || (m.mediaUrl ? { url: m.mediaUrl, type: m.mediaMimeType, name: m.fileName, duration: m.mediaDuration } : null),
        createdAt: m.created_at || m.createdAt || new Date().toISOString(),
        isRead: m.is_read || m.status === 'read',
      }));

      setMessages(parsed);
    } catch (err: any) {
      console.warn('Failed to load chat history:', err.message);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, role, portalToken]);

  useEffect(() => {
    fetchMessages();
    socketService.joinProject(projectId);

    // Socket message listener (matching web CHAT_MESSAGE_NEW)
    const unbindMessage = socketService.on('CHAT_MESSAGE_NEW', (payload: any) => {
      const msg = payload.message || payload;
      const newMsg: ChatMessage = {
        id: msg.id || String(Math.random()),
        projectId: msg.projectId || msg.project_id || projectId,
        senderRole: msg.senderRole || msg.sender_role || 'consultant',
        senderName: msg.senderName || msg.sender_name || 'Member',
        text: msg.text || msg.content || '',
        attachment: msg.attachment || (msg.mediaUrl ? { url: msg.mediaUrl, type: msg.mediaMimeType, name: msg.fileName, duration: msg.mediaDuration } : null),
        createdAt: msg.createdAt || msg.created_at || new Date().toISOString(),
        isRead: false,
      };

      setMessages((prev) => [...prev, newMsg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });

    // Also support fallback CHAT_MESSAGE
    const unbindFallback = socketService.on('CHAT_MESSAGE', (payload: any) => {
      const newMsg: ChatMessage = {
        id: payload.id || String(Math.random()),
        projectId: payload.project_id || projectId,
        senderRole: payload.sender_role || 'consultant',
        senderName: payload.sender_name || 'Member',
        text: payload.text || payload.content || '',
        attachment: payload.attachment || null,
        createdAt: payload.created_at || new Date().toISOString(),
        isRead: false,
      };
      setMessages((prev) => [...prev, newMsg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });

    const unbindTyping = socketService.on('TYPING_INDICATOR', (payload: any) => {
      if (payload.project_id === projectId && payload.sender_role !== role) {
        setIsTyping(Boolean(payload.is_typing));
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
      }
    });

    return () => {
      unbindMessage();
      unbindFallback();
      unbindTyping();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [fetchMessages, projectId, role]);

  const handleSendText = () => {
    const text = inputText.trim();
    if (!text) return;

    socketService.send({
      type: 'CHAT_MESSAGE_SEND',
      projectId,
      project_id: projectId,
      text,
      senderRole: role,
    });

    setInputText('');
    socketService.sendTyping(projectId, false);
  };

  const handleInputChange = (text: string) => {
    setInputText(text);
    if (text.length > 0) {
      socketService.sendTyping(projectId, true);
    }
  };

  const handlePickImage = async () => {
    try {
      const perm = await PermissionService.requestMediaLibrary();
      if (!perm.granted) {
        setPermissionModalState({
          visible: true,
          type: 'mediaLibrary',
          isBlocked: !perm.canAskAgain,
        });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        await uploadMediaFile(result.assets[0].uri, 'image/jpeg', 'image.jpg');
      }
    } catch (err: any) {
      Alert.alert('Upload Error', err.message);
    }
  };

  const startRecording = async () => {
    try {
      const perm = await PermissionService.requestMicrophone();
      if (!perm.granted) {
        setPermissionModalState({
          visible: true,
          type: 'microphone',
          isBlocked: !perm.canAskAgain,
        });
        return;
      }

      if (AudioService.isSupported()) {
        await AudioService.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
        const { recording: newRecording } = await AudioService.createRecordingAsync(
          AudioService.getPresets().HIGH_QUALITY
        );
        setRecording(newRecording);
      }

      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch {
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    }
  };

  const handleSafeStartCall = async (video: boolean) => {
    if (video) {
      const camPerm = await PermissionService.requestCamera();
      if (!camPerm.granted) {
        setPermissionModalState({
          visible: true,
          type: 'camera',
          isBlocked: !camPerm.canAskAgain,
        });
        return;
      }
    }
    const micPerm = await PermissionService.requestMicrophone();
    if (!micPerm.granted) {
      setPermissionModalState({
        visible: true,
        type: 'microphone',
        isBlocked: !micPerm.canAskAgain,
      });
      return;
    }
    onStartCall(video);
  };

  const stopRecording = async () => {
    if (!isRecording) return;

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    const finalDuration = Math.max(recordingDuration, 1);
    setIsRecording(false);

    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
        const uri = recording.getURI();
        setRecording(null);
        if (uri) {
          await uploadMediaFile(uri, 'audio/m4a', 'voice_note.m4a', finalDuration);
          return;
        }
      } catch {
        setRecording(null);
      }
    }

    // Send voice note with duration
    socketService.sendChatMessage(projectId, '', {
      type: 'audio/m4a',
      name: `Voice Note (${finalDuration}s)`,
      duration: finalDuration,
      url: '/media/voice_note.m4a',
    });

    const localMsg: ChatMessage = {
      id: `local-vn-${Date.now()}`,
      projectId,
      senderRole: role || 'consultant',
      senderName: 'You',
      text: '',
      attachment: {
        type: 'audio/m4a',
        name: `Voice Note (${finalDuration}s)`,
        duration: finalDuration,
        url: '/media/voice_note.m4a',
      },
      createdAt: new Date().toISOString(),
      isRead: false,
    };
    setMessages((prev) => [...prev, localMsg]);
  };

  const uploadMediaFile = async (
    uri: string,
    mimeType: string,
    fileName: string,
    duration?: number
  ) => {
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
        type: mimeType,
        name: fileName,
      } as any);

      if (duration) {
        formData.append('duration', String(duration));
      }

      let endpoint = `/projects/${projectId}/messages/upload/`;
      if (role === 'client' && portalToken) {
        endpoint = `/client-portal/${portalToken}/messages/upload/`;
      }

      const res = await api.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data?.attachment || res.data?.mediaUrl) {
        socketService.send({
          type: 'CHAT_MESSAGE_SEND',
          projectId,
          project_id: projectId,
          text: '',
          mediaUrl: res.data?.mediaUrl || res.data?.attachment?.url,
          mediaMimeType: mimeType,
          mediaDuration: duration,
          fileName,
          senderRole: role,
        });
      }
    } catch (err: any) {
      Alert.alert('Upload Failed', err.response?.data?.detail || err.message);
    }
  };

  const renderMessageItem = ({ item }: { item: ChatMessage }) => {
    const isMe = item.senderRole === role;

    return (
      <View style={[styles.bubbleRow, isMe ? styles.rowOutgoing : styles.rowIncoming]}>
        <View style={[styles.bubble, isMe ? styles.bubbleOutgoing : styles.bubbleIncoming]}>
          {!isMe && <Text style={styles.bubbleSender}>{item.senderName}</Text>}

          {item.attachment && (
            <View style={styles.attachmentWrap}>
              {item.attachment.type?.startsWith('image') ? (
                <Image
                  source={{ uri: `${API_BASE_URL.replace('/api', '')}${item.attachment.url}` }}
                  style={styles.attachmentImage}
                  resizeMode="cover"
                />
              ) : (
                <TouchableOpacity
                  style={styles.audioWrap}
                  onPress={() =>
                    handleTogglePlayAudio(
                      item.id,
                      item.attachment?.url,
                      item.attachment?.duration || 5
                    )
                  }
                  activeOpacity={0.8}
                >
                  <View style={styles.audioPlayBtn}>
                    {playingAudioId === item.id ? (
                      <Pause size={14} color={THEME.neon} strokeWidth={2.4} />
                    ) : (
                      <Play size={14} color={THEME.neon} strokeWidth={2.4} />
                    )}
                  </View>

                  <View style={styles.audioDetails}>
                    <View style={styles.waveformRow}>
                      {[8, 16, 22, 12, 18, 10, 24, 14, 20, 16, 12, 18, 14].map((h, idx) => (
                        <View
                          key={idx}
                          style={[
                            styles.waveBar,
                            {
                              height: playingAudioId === item.id ? (h * 1.2) % 24 + 6 : h,
                              backgroundColor:
                                playingAudioId === item.id
                                  ? THEME.neon
                                  : 'rgba(255, 255, 255, 0.45)',
                            },
                          ]}
                        />
                      ))}
                    </View>
                    <Text style={styles.audioSub}>
                      {playingAudioId === item.id
                        ? 'Playing audio...'
                        : item.attachment.duration
                        ? `${item.attachment.duration}s Voice Note`
                        : 'Voice Note'}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          )}

          {item.text ? <Text style={styles.bubbleText}>{item.text}</Text> : null}

          <View style={styles.metaRow}>
            <Text style={styles.timeText}>
              {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {isMe && <CheckCheck size={14} color="#53bdeb" strokeWidth={2} style={{ marginLeft: 3 }} />}
          </View>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* WhatsApp Styled Top Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <ArrowLeft size={20} color="#ffffff" strokeWidth={2.4} />
        </TouchableOpacity>

        <View style={styles.avatarWrap}>
          <Text style={styles.avatarText}>{contactName.charAt(0).toUpperCase()}</Text>
        </View>

        <View style={styles.headerInfo}>
          <Text style={styles.contactName} numberOfLines={1}>
            {contactName}
          </Text>
          <View style={styles.statusPill}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineLabel}>Online</Text>
          </View>
        </View>

        {/* Video & Audio Call Action Icons */}
        <View style={styles.callIcons}>
          <TouchableOpacity style={styles.iconCircle} onPress={() => handleSafeStartCall(false)} activeOpacity={0.7}>
            <Phone size={18} color="#e9edef" strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconCircle} onPress={() => handleSafeStartCall(true)} activeOpacity={0.7}>
            <Video size={19} color="#e9edef" strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages Canvas with WhatsApp doodle background */}
      <ImageBackground
        source={require('../../assets/whatsapp-chat-bg.jpg')}
        style={styles.chatBackground}
        imageStyle={{ opacity: 0.12 }}
      >
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="small" color={THEME.neon} />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessageItem}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {isTyping && (
          <View style={styles.typingIndicator}>
            <Text style={styles.typingText}>{contactName} is typing...</Text>
          </View>
        )}
      </ImageBackground>

      {/* WhatsApp Styled Input Bar */}
      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TouchableOpacity style={styles.inputActionBtn} onPress={handlePickImage} activeOpacity={0.7}>
          <Paperclip size={20} color="#8696a0" strokeWidth={2} />
        </TouchableOpacity>

        {isRecording ? (
          <View style={styles.recordingPill}>
            <View style={styles.recordingRedDot} />
            <Text style={styles.recordingCounter}>{recordingDuration}s Recording</Text>
            <TouchableOpacity style={styles.sendVoiceBtn} onPress={stopRecording} activeOpacity={0.8}>
              <Text style={styles.sendVoiceText}>Send</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TextInput
              style={styles.textInput}
              placeholder="Type a message..."
              placeholderTextColor="#8696a0"
              value={inputText}
              onChangeText={handleInputChange}
              multiline
            />

            {inputText.trim().length > 0 ? (
              <TouchableOpacity style={styles.sendCircle} onPress={handleSendText} activeOpacity={0.8}>
                <Send size={16} color="#ffffff" strokeWidth={2.4} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.micCircle} onPress={startRecording} activeOpacity={0.8}>
                <Mic size={18} color="#ffffff" strokeWidth={2.2} />
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
      {/* Branded Permissions Modal */}
      <PermissionModal
        visible={permissionModalState.visible}
        type={permissionModalState.type}
        isBlocked={permissionModalState.isBlocked}
        onClose={() => setPermissionModalState((prev) => ({ ...prev, visible: false }))}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.chat.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: THEME.chat.header,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  backButton: {
    paddingHorizontal: 6,
    marginRight: 4,
  },
  backButtonText: {
    color: THEME.neon,
    fontSize: 32,
    lineHeight: 32,
    marginTop: -4,
  },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#005c4b',
    borderWidth: 1,
    borderColor: THEME.neon,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerInfo: {
    flex: 1,
  },
  contactName: {
    color: '#e9edef',
    fontSize: 16,
    fontWeight: '700',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.chat.onlinePill,
  },
  onlineLabel: {
    color: THEME.chat.onlinePill,
    fontSize: 11,
    fontWeight: '600',
  },
  callIcons: {
    flexDirection: 'row',
    gap: 8,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  iconEmoji: {
    fontSize: 16,
  },
  chatBackground: {
    flex: 1,
    backgroundColor: THEME.chat.bg,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messagesList: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bubbleRow: {
    marginVertical: 4,
    width: '100%',
    flexDirection: 'row',
  },
  rowOutgoing: {
    justifyContent: 'flex-end',
  },
  rowIncoming: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  bubbleOutgoing: {
    backgroundColor: THEME.chat.bubbleOutgoing,
    borderTopRightRadius: 2,
  },
  bubbleIncoming: {
    backgroundColor: THEME.chat.bubbleIncoming,
    borderTopLeftRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  bubbleSender: {
    color: THEME.neon,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  bubbleText: {
    color: '#e9edef',
    fontSize: 14.5,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4,
  },
  timeText: {
    color: THEME.chat.textMuted,
    fontSize: 10,
  },
  ticksText: {
    color: '#53bdeb',
    fontSize: 11,
    fontWeight: '700',
  },
  attachmentWrap: {
    marginBottom: 6,
    borderRadius: 8,
    overflow: 'hidden',
  },
  attachmentImage: {
    width: 220,
    height: 150,
    borderRadius: 6,
  },
  audioWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    borderRadius: 12,
    gap: 10,
    minWidth: 200,
  },
  audioPlayBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(77, 255, 160, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(77, 255, 160, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 4,
    height: 24,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
  },
  audioDetails: {
    flex: 1,
  },
  audioTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  audioSub: {
    color: THEME.neon,
    fontSize: 11,
    fontWeight: '600',
  },
  typingIndicator: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: 'rgba(32, 44, 51, 0.85)',
  },
  typingText: {
    color: THEME.neon,
    fontSize: 12,
    fontStyle: 'italic',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: THEME.chat.inputBar,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  inputActionBtn: {
    padding: 8,
    marginRight: 4,
  },
  inputActionIcon: {
    fontSize: 20,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#2a3942',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: '#e9edef',
    fontSize: 15,
    maxHeight: 100,
  },
  sendCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#00a884',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendArrow: {
    color: '#ffffff',
    fontSize: 16,
    marginLeft: 2,
  },
  micCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#00a884',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  micEmoji: {
    fontSize: 18,
  },
  recordingPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a3942',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  recordingRedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff3b30',
    marginRight: 8,
  },
  recordingCounter: {
    flex: 1,
    color: '#ff6b6b',
    fontWeight: '700',
    fontSize: 13,
  },
  sendVoiceBtn: {
    backgroundColor: '#00a884',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  sendVoiceText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
