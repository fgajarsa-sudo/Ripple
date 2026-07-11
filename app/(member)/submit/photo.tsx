import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSubmitDraft } from '../../../lib/SubmitDraftContext';

export default function PhotoStep() {
  const { draft, updateDraft } = useSubmitDraft();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const onCapture = async () => {
    if (!cameraRef.current) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (photo) {
        updateDraft({ photoUri: photo.uri });
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const goNext = () => router.push('/(member)/submit/data');

  if (draft.photoUri) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Capture the water</Text>
        <Image source={{ uri: draft.photoUri }} style={styles.preview} />
        <View style={styles.previewActions}>
          <Pressable style={styles.retakeButton} onPress={() => updateDraft({ photoUri: null })}>
            <Text style={styles.retakeButtonText}>Retake</Text>
          </Pressable>
          <Pressable style={styles.nextButton} onPress={goNext}>
            <Text style={styles.nextButtonText}>Next</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission) {
    return <SafeAreaView style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Capture the water</Text>
        <Text style={styles.hint}>A photo helps our AI assess visible conditions.</Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.nextButtonText}>Allow camera access</Text>
        </Pressable>
        <Pressable style={styles.skipButton} onPress={goNext}>
          <Text style={styles.skipButtonText}>Skip photo</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Capture the water</Text>
      <Text style={styles.hint}>Lake surface, top-down works best</Text>
      <View style={styles.cameraWrapper}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />
      </View>
      <View style={styles.previewActions}>
        <Pressable style={styles.skipButton} onPress={goNext}>
          <Text style={styles.skipButtonText}>Skip</Text>
        </Pressable>
        <Pressable style={styles.captureButton} onPress={onCapture} disabled={isCapturing}>
          <View style={styles.captureButtonInner} />
        </Pressable>
        <View style={{ width: 60 }} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f4c5c' },
  hint: { fontSize: 14, color: '#4a5a5f' },
  cameraWrapper: { flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' },
  camera: { flex: 1 },
  preview: { flex: 1, borderRadius: 16 },
  previewActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#0f4c5c',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  captureButtonInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#0f4c5c' },
  retakeButton: {
    borderWidth: 1,
    borderColor: '#0f4c5c',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  retakeButtonText: { color: '#0f4c5c', fontSize: 16, fontWeight: '600' },
  nextButton: { backgroundColor: '#0f4c5c', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32 },
  nextButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  permissionButton: {
    backgroundColor: '#0f4c5c',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  skipButton: { paddingVertical: 14, paddingHorizontal: 8 },
  skipButtonText: { color: '#4a5a5f', fontSize: 15 },
});
