import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ImageBackground,
  Platform,
} from 'react-native';
import {
  Video,
  VideoOff,
  Phone,
  PhoneOff,
  PhoneCall,
  Mic,
  MicOff,
  Camera,
  RefreshCw,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { socketService } from '../services/socket';
import { PermissionService, FloxaPermissionType } from '../services/permissions';
import { PermissionModal } from '../components/PermissionModal';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../constants/theme';

interface CallScreenProps {
  projectId: string;
  contactName: string;
  isVideo: boolean;
  isIncoming?: boolean;
  onEndCall: () => void;
}

export const CallScreen: React.FC<CallScreenProps> = ({
  projectId,
  contactName,
  isVideo,
  isIncoming = false,
  onEndCall,
}) => {
  const insets = useSafeAreaInsets();
  const { role } = useAuth();
  const [callStatus, setCallStatus] = useState<'initiating' | 'ringing' | 'connected' | 'ended'>(
    isIncoming ? 'ringing' : 'initiating'
  );
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [offlineNotice, setOfflineNotice] = useState<string | null>(null);
  const [permissionModalState, setPermissionModalState] = useState<{
    visible: boolean;
    type: FloxaPermissionType;
    isBlocked: boolean;
  }>({
    visible: false,
    type: 'camera',
    isBlocked: false,
  });

  const durationTimerRef = useRef<any>(null);

  // Check required device permissions upon entering the call
  useEffect(() => {
    (async () => {
      if (isVideo) {
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
      }
    })();
  }, [isVideo]);

  useEffect(() => {
    if (!isIncoming) {
      socketService.sendWebRTCSignal('call_initiate', projectId, {
        is_video: isVideo,
        sender_role: role,
      });
      setCallStatus('ringing');
    }

    const unbindSignal = socketService.on('WEBRTC_SIGNAL', (payload: any) => {
      const action = payload.action;

      if (action === 'call_accept') {
        setOfflineNotice(null);
        setCallStatus('connected');
        startDurationTimer();
      } else if (action === 'call_reject' || action === 'call_end') {
        const reason =
          payload.data?.reason ||
          'Participant is offline. A push notification was delivered to their device.';
        setOfflineNotice(reason);
        setCallStatus('ended');
        stopDurationTimer();
      }
    });

    return () => {
      unbindSignal();
      stopDurationTimer();
    };
  }, [isIncoming, isVideo, projectId, role]);

  const startDurationTimer = () => {
    stopDurationTimer();
    durationTimerRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  };

  const stopDurationTimer = () => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  };

  const handleAcceptCall = () => {
    socketService.sendWebRTCSignal('call_accept', projectId, {
      sender_role: role,
    });
    setCallStatus('connected');
    startDurationTimer();
  };

  const handleEndCall = () => {
    socketService.sendWebRTCSignal('call_reject', projectId, {
      sender_role: role,
      reason: 'Call ended by user',
    });
    setCallStatus('ended');
    stopDurationTimer();
    onEndCall();
  };

  const handleStartSimulation = () => {
    setOfflineNotice(null);
    setCallStatus('connected');
    startDurationTimer();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <ImageBackground
      source={require('../../assets/banner1.png')}
      style={styles.fullBg}
      resizeMode="cover"
    >
      <View
        style={[
          styles.ambientOverlay,
          {
            paddingTop: Math.max(insets.top, 24),
            paddingBottom: Math.max(insets.bottom, 24),
          },
        ]}
      >
        {/* Top Bar Status */}
        <View style={styles.topInfoBar}>
          <View style={styles.callBadge}>
            {isVideo ? (
              <Video size={13} color={THEME.neon} strokeWidth={2.4} />
            ) : (
              <Phone size={13} color={THEME.neon} strokeWidth={2.4} />
            )}
            <Text style={styles.callBadgeText}>
              {isVideo ? 'HD VIDEO CONSULTATION' : 'VOICE CONSULTATION'}
            </Text>
          </View>

          <Text style={styles.callStatusText}>
            {callStatus === 'connected'
              ? formatDuration(callDuration)
              : callStatus === 'ringing'
              ? isIncoming
                ? 'Incoming Call...'
                : 'Ringing participant...'
              : callStatus === 'ended'
              ? 'Call Ended'
              : 'Connecting WebRTC...'}
          </Text>
        </View>

        {/* Video or Audio Main Canvas */}
        {callStatus === 'connected' && isVideo ? (
          /* Connected Video Call View */
          <View style={styles.videoCanvas}>
            {/* Remote Participant Frame */}
            <View style={styles.remoteVideoCard}>
              <View style={styles.avatarCircleBig}>
                <Text style={styles.avatarTextBig}>{contactName.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.remoteVideoName}>{contactName}</Text>
              <Text style={styles.remoteVideoStatus}>Live Video Stream Connected</Text>

              {/* Simulated speech pulse */}
              <View style={styles.speakingWaveRow}>
                <View style={[styles.speakingDot, { height: 16 }]} />
                <View style={[styles.speakingDot, { height: 26 }]} />
                <View style={[styles.speakingDot, { height: 34 }]} />
                <View style={[styles.speakingDot, { height: 22 }]} />
                <View style={[styles.speakingDot, { height: 14 }]} />
              </View>
            </View>

            {/* Self Picture-in-Picture Frame */}
            <View style={styles.pipSelfFrame}>
              {isVideoMuted ? (
                <View style={styles.pipMutedOverlay}>
                  <VideoOff size={16} color={THEME.textMuted} strokeWidth={2} />
                  <Text style={styles.pipMutedText}>Camera Off</Text>
                </View>
              ) : (
                <View style={styles.pipActiveWrap}>
                  <Text style={styles.pipSelfLabel}>You ({isFrontCamera ? 'Front' : 'Back'})</Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          /* Avatar & Audio Call / Ringing View */
          <View style={styles.centerBox}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{contactName.charAt(0).toUpperCase()}</Text>
            </View>

            <Text style={styles.contactName}>{contactName}</Text>

            {/* Offline or Status Notice */}
            {offlineNotice ? (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeText}>{offlineNotice}</Text>
                <TouchableOpacity
                  style={styles.simulationBtn}
                  onPress={handleStartSimulation}
                  activeOpacity={0.8}
                >
                  <Sparkles size={14} color="#000704" strokeWidth={2.4} />
                  <Text style={styles.simulationBtnText}>Test Call Interface & Features</Text>
                </TouchableOpacity>
              </View>
            ) : callStatus === 'ringing' && !isIncoming ? (
              <View style={{ alignItems: 'center', marginTop: 14 }}>
                <ActivityIndicator color={THEME.neon} size="small" />
                <TouchableOpacity
                  style={styles.connectTestPill}
                  onPress={handleStartSimulation}
                  activeOpacity={0.8}
                >
                  <Text style={styles.connectTestPillText}>Switch to Test Call Mode</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        )}

        {/* Control Buttons Bar */}
        <View style={styles.controlsBar}>
          {callStatus === 'ringing' && isIncoming ? (
            <View style={styles.incomingControls}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.declineBtn]}
                onPress={handleEndCall}
                activeOpacity={0.8}
              >
                <PhoneOff size={22} color="#ffffff" strokeWidth={2.4} />
                <Text style={styles.actionLabel}>Decline</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.acceptBtn]}
                onPress={handleAcceptCall}
                activeOpacity={0.8}
              >
                <PhoneCall size={22} color="#ffffff" strokeWidth={2.4} />
                <Text style={styles.actionLabel}>Accept</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.inCallControls}>
              {/* Mic Toggle */}
              <TouchableOpacity
                style={[styles.roundBtn, isAudioMuted && styles.roundBtnActive]}
                onPress={() => setIsAudioMuted(!isAudioMuted)}
                activeOpacity={0.8}
              >
                {isAudioMuted ? (
                  <MicOff size={22} color="#ffffff" strokeWidth={2.2} />
                ) : (
                  <Mic size={22} color="#ffffff" strokeWidth={2.2} />
                )}
              </TouchableOpacity>

              {/* Video Toggle (if Video Call) */}
              {isVideo && (
                <>
                  <TouchableOpacity
                    style={[styles.roundBtn, isVideoMuted && styles.roundBtnActive]}
                    onPress={() => setIsVideoMuted(!isVideoMuted)}
                    activeOpacity={0.8}
                  >
                    {isVideoMuted ? (
                      <VideoOff size={22} color="#ffffff" strokeWidth={2.2} />
                    ) : (
                      <Video size={22} color="#ffffff" strokeWidth={2.2} />
                    )}
                  </TouchableOpacity>

                  {/* Camera Flip */}
                  <TouchableOpacity
                    style={styles.roundBtn}
                    onPress={() => setIsFrontCamera(!isFrontCamera)}
                    activeOpacity={0.8}
                  >
                    <RefreshCw size={20} color="#ffffff" strokeWidth={2.2} />
                  </TouchableOpacity>
                </>
              )}

              {/* Speaker Toggle */}
              <TouchableOpacity
                style={[styles.roundBtn, isSpeakerMuted && styles.roundBtnActive]}
                onPress={() => setIsSpeakerMuted(!isSpeakerMuted)}
                activeOpacity={0.8}
              >
                {isSpeakerMuted ? (
                  <VolumeX size={22} color="#ffffff" strokeWidth={2.2} />
                ) : (
                  <Volume2 size={22} color="#ffffff" strokeWidth={2.2} />
                )}
              </TouchableOpacity>

              {/* End Call Button */}
              <TouchableOpacity
                style={[styles.roundBtn, styles.endCallBtn]}
                onPress={handleEndCall}
                activeOpacity={0.8}
              >
                <PhoneOff size={22} color="#ffffff" strokeWidth={2.4} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Permissions Modal */}
      <PermissionModal
        visible={permissionModalState.visible}
        type={permissionModalState.type}
        isBlocked={permissionModalState.isBlocked}
        onClose={() => setPermissionModalState((prev) => ({ ...prev, visible: false }))}
      />
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
    justifyContent: 'space-between',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  topInfoBar: {
    alignItems: 'center',
    gap: 8,
  },
  callBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(77, 255, 160, 0.12)',
    borderWidth: 1,
    borderColor: THEME.neon,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  callBadgeText: {
    color: THEME.neon,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  callStatusText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  centerBox: {
    alignItems: 'center',
    marginVertical: 20,
  },
  avatarCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#005c4b',
    borderWidth: 2,
    borderColor: THEME.neon,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: THEME.neon,
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 8,
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 44,
    fontWeight: 'bold',
  },
  contactName: {
    color: THEME.text,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  noticeBox: {
    backgroundColor: 'rgba(4, 20, 13, 0.85)',
    borderWidth: 1.2,
    borderColor: 'rgba(77, 255, 160, 0.28)',
    borderTopColor: THEME.borderGlassTop,
    borderRadius: 18,
    padding: 16,
    marginTop: 20,
    alignItems: 'center',
    maxWidth: 320,
  },
  noticeText: {
    color: THEME.textMuted,
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 14,
  },
  simulationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: THEME.neon,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  simulationBtnText: {
    color: THEME.textDark,
    fontSize: 12,
    fontWeight: '800',
  },
  connectTestPill: {
    marginTop: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  connectTestPillText: {
    color: THEME.text,
    fontSize: 12,
    fontWeight: '600',
  },
  videoCanvas: {
    flex: 1,
    marginVertical: 16,
    position: 'relative',
  },
  remoteVideoCard: {
    flex: 1,
    backgroundColor: 'rgba(4, 20, 13, 0.72)',
    borderRadius: 24,
    borderWidth: 1.2,
    borderColor: 'rgba(77, 255, 160, 0.25)',
    borderTopColor: THEME.borderGlassTop,
    borderBottomColor: THEME.borderGlassBottom,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarCircleBig: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#005c4b',
    borderWidth: 2,
    borderColor: THEME.neon,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarTextBig: {
    color: '#ffffff',
    fontSize: 40,
    fontWeight: 'bold',
  },
  remoteVideoName: {
    color: THEME.text,
    fontSize: 20,
    fontWeight: '800',
  },
  remoteVideoStatus: {
    color: THEME.neon,
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  speakingWaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 20,
    height: 36,
  },
  speakingDot: {
    width: 4,
    backgroundColor: THEME.neon,
    borderRadius: 2,
  },
  pipSelfFrame: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 100,
    height: 140,
    borderRadius: 16,
    backgroundColor: 'rgba(6, 26, 17, 0.92)',
    borderWidth: 1.5,
    borderColor: THEME.neon,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipActiveWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
  pipSelfLabel: {
    color: THEME.neon,
    fontSize: 10,
    fontWeight: '700',
  },
  pipMutedOverlay: {
    alignItems: 'center',
    gap: 4,
  },
  pipMutedText: {
    color: THEME.textMuted,
    fontSize: 9,
    fontWeight: '600',
  },
  controlsBar: {
    alignItems: 'center',
    paddingBottom: 10,
  },
  incomingControls: {
    flexDirection: 'row',
    gap: 36,
  },
  inCallControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  roundBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundBtnActive: {
    backgroundColor: '#dc2626',
    borderColor: '#ef4444',
  },
  endCallBtn: {
    backgroundColor: '#dc2626',
    borderColor: '#ef4444',
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  actionBtn: {
    alignItems: 'center',
    gap: 6,
  },
  declineBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
});
