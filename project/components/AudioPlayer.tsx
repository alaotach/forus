import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Play, Pause, Square } from 'lucide-react-native';
import { useAudioPlayer } from 'expo-audio';

interface AudioPlayerProps {
  audioUrl: string;
  duration?: number;
  onPlaybackFinish?: () => void;
}

export default function AudioPlayer({ audioUrl, duration, onPlaybackFinish }: AudioPlayerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const player = useAudioPlayer(audioUrl);

  useEffect(() => {
    // Set up playback status listener
    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.isLoaded) {
        setIsLoading(false);
        if (status.didJustFinish && onPlaybackFinish) {
          onPlaybackFinish();
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [player, onPlaybackFinish]);

  const handlePlayPause = async () => {
    try {
      if (player.playing) {
        await player.pause();
      } else {
        setIsLoading(true);
        await player.play();
      }
    } catch (error) {
      console.error('Playback error:', error);
      Alert.alert('Error', 'Failed to play audio');
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    try {
      await player.seekTo(0);
      await player.pause();
    } catch (error) {
      console.error('Stop error:', error);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.playButton} onPress={handlePlayPause}>
        {isLoading ? (
          <Text style={styles.loadingText}>...</Text>
        ) : player.playing ? (
          <Pause size={20} color="#ffffff" />
        ) : (
          <Play size={20} color="#ffffff" />
        )}
      </TouchableOpacity>
      
      <View style={styles.info}>
        <View style={styles.waveform}>
          {Array.from({ length: 12 }).map((_, i) => (
            <View 
              key={i} 
              style={[
                styles.waveBar,
                player.playing && styles.activeWaveBar
              ]} 
            />
          ))}
        </View>
        {duration && (
          <Text style={styles.duration}>
            {formatDuration(duration)}
          </Text>
        )}
      </View>

      {player.playing && (
        <TouchableOpacity style={styles.stopButton} onPress={handleStop}>
          <Square size={16} color="#666" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ff6b9d',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  info: {
    flex: 1,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 20,
    marginBottom: 4,
  },
  waveBar: {
    width: 3,
    height: 8,
    backgroundColor: '#ddd',
    marginRight: 2,
    borderRadius: 1.5,
  },
  activeWaveBar: {
    backgroundColor: '#ff6b9d',
    height: 16,
  },
  duration: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#666',
  },
  stopButton: {
    padding: 8,
    marginLeft: 8,
  },
});
