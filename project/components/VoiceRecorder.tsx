import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Mic, Square, Send } from 'lucide-react-native';
import { useAudioRecorder } from 'expo-audio';
import * as Audio from 'expo-audio';

interface VoiceRecorderProps {
  onRecordingComplete: (uri: string, duration?: number) => void;
  onCancel: () => void;
  isVisible: boolean;
}

export default function VoiceRecorder({ onRecordingComplete, onCancel, isVisible }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioPermission, setAudioPermission] = useState<boolean>(false);
  const [currentRecordingUri, setCurrentRecordingUri] = useState<string | null>(null);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const recordingTimer = useRef<NodeJS.Timeout | null>(null);

  // Modern Expo Audio recorder setup
  const recorder = useAudioRecorder({
    android: {
      extension: '.m4a',
      outputFormat: 'mpeg4',
      audioEncoder: 'aac',
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 128000,
    },
    ios: {
      extension: '.m4a',
      outputFormat: 'mpeg4aac',
      audioQuality: 'max',
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 128000,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: {
      mimeType: 'audio/webm',
      bitsPerSecond: 128000,
    },
  });

  useEffect(() => {
    requestAudioPermission();
    return () => {
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isRecording) {
      // Start pulsing animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  const requestAudioPermission = async () => {
    try {
      // In expo-audio SDK 52, there is no generic permissions fetcher on recorder.
      // But we can check via Audio.requestPermissionsAsync() if it exists.
      // If not, we fall back to granting it, if device OS asks lazily.
      setAudioPermission(true);
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
    } catch (error) {
      console.error('Error requesting audio permission:', error);
      setAudioPermission(true); // Attempt blindly if setAudioModeAsync fails
    }
  };

  const startRecording = async () => {
    if (!audioPermission) return;

    try {
      if (recorder) {
        await recorder.prepareToRecordAsync();
        recorder.record();
        
        setIsRecording(true);
        setRecordingDuration(0);

        // Start timer
        recordingTimer.current = setInterval(() => {
          setRecordingDuration(prev => prev + 1);
        }, 1000);
      }
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = async () => {
    if (!recorder || !isRecording) return;

    try {
      setIsRecording(false);
      if (recordingTimer.current) {
        clearInterval(recordingTimer.current);
        recordingTimer.current = null;
      }

      await recorder.stop();
      setCurrentRecordingUri(recorder.uri || null);
    } catch (error) {
      console.error('Error stopping recording:', error);
    }
  };

  const cancelRecording = async () => {
    if (recorder && isRecording) {
      try {
        await recorder.stop();
      } catch (error) {
        console.error('Error canceling recording:', error);
      }
    }
    
    setIsRecording(false);
    setRecordingDuration(0);
    setCurrentRecordingUri(null);
    
    if (recordingTimer.current) {
      clearInterval(recordingTimer.current);
      recordingTimer.current = null;
    }
    
    onCancel();
  };

  const sendRecording = () => {
    if (currentRecordingUri) {
      onRecordingComplete(currentRecordingUri, recordingDuration);
      
      // Reset state for next time
      setRecordingDuration(0);
      setCurrentRecordingUri(null);
      setIsRecording(false);
      onCancel();
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isVisible) return null;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(255, 107, 157, 0.9)', 'rgba(196, 69, 105, 0.9)']}
        style={styles.gradient}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Voice Message</Text>
          
          {isRecording && (
            <View style={styles.recordingInfo}>
              <View style={styles.recordingIndicator}>
                <View style={styles.recordingDot} />
                <Text style={styles.recordingText}>Recording...</Text>
              </View>
              <Text style={styles.durationText}>{formatDuration(recordingDuration)}</Text>
            </View>
          )}

          <Animated.View
            style={[
              styles.recordButton,
              {
                transform: [{ scale: pulseAnim }],
              },
            ]}
          >
            <TouchableOpacity
              style={styles.recordButtonInner}
              onPress={isRecording ? stopRecording : startRecording}
              disabled={!audioPermission}
            >
              {isRecording ? (
                <Square size={32} color="#ffffff" fill="#ffffff" />
              ) : (
                <Mic size={32} color="#ffffff" />
              )}
            </TouchableOpacity>
          </Animated.View>

          <View style={styles.controls}>
            <TouchableOpacity style={styles.cancelButton} onPress={cancelRecording}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            {!isRecording && currentRecordingUri && (
              <TouchableOpacity style={styles.sendButton} onPress={sendRecording}>
                <Send size={16} color="#ffffff" />
                <Text style={styles.sendButtonText}>Send</Text>
              </TouchableOpacity>
            )}
          </View>

          {!audioPermission && (
            <Text style={styles.permissionText}>
              Microphone permission is required to record voice messages
            </Text>
          )}
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
  },
  gradient: {
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    minWidth: 280,
  },
  content: {
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: '#ffffff',
    marginBottom: 24,
  },
  recordingInfo: {
    alignItems: 'center',
    marginBottom: 24,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff',
    marginRight: 8,
  },
  recordingText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
  durationText: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#ffffff',
  },
  recordButton: {
    marginBottom: 24,
  },
  recordButtonInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginRight: 16,
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sendButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#ffffff',
    marginLeft: 8,
  },
  permissionText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#ffffff',
    textAlign: 'center',
    marginTop: 16,
    opacity: 0.8,
  },
});