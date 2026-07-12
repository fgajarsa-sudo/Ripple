import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '../../../components/AppHeader';
import { ScreenTitle } from '../../../components/ui';
import { colors, fonts, radius } from '../../../lib/theme';
import { useSubmitDraft } from '../../../lib/SubmitDraftContext';

export default function PhotoStep() {
  const { draft, updateDraft, resetDraft } = useSubmitDraft();
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
  const onCancel = () => {
    resetDraft();
    router.replace('/(member)/home');
  };

  const header = (
    <AppHeader
      right={
        <Pressable onPress={onCancel}>
          <Text style={styles.cancelLink}>Cancel</Text>
        </Pressable>
      }
    />
  );

  if (draft.photoUri) {
    return (
      <View style={styles.root}>
        {header}
        <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
          <ScreenTitle>Capture the water</ScreenTitle>
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
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={styles.root}>
        {header}
        <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.root}>
        {header}
        <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
          <ScreenTitle>Capture the water</ScreenTitle>
          <Text style={styles.hint}>A photo helps our AI assess visible conditions.</Text>
          <Pressable style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.nextButtonText}>Allow camera access</Text>
          </Pressable>
          <Pressable style={styles.skipButton} onPress={goNext}>
            <Text style={styles.skipButtonText}>Skip photo</Text>
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {header}
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <ScreenTitle>Capture the water</ScreenTitle>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  container: { flex: 1, padding: 24, gap: 12 },
  cancelLink: { fontSize: 14, color: colors.cream, opacity: 0.8, fontFamily: fonts.body },
  hint: { fontSize: 14, color: colors.mutedForeground, fontFamily: fonts.body },
  cameraWrapper: { flex: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#000' },
  camera: { flex: 1 },
  preview: { flex: 1, borderRadius: radius.md },
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
    borderColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  captureButtonInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.teal },
  retakeButton: {
    borderWidth: 1,
    borderColor: colors.teal,
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  retakeButtonText: { color: colors.teal, fontSize: 16, fontFamily: fonts.bodySemiBold },
  nextButton: {
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  nextButtonText: { color: colors.tealForeground, fontSize: 16, fontFamily: fonts.bodySemiBold },
  permissionButton: {
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
    paddingVertical: 16,
    alignItems: 'center',
  },
  skipButton: { paddingVertical: 14, paddingHorizontal: 8 },
  skipButtonText: { color: colors.mutedForeground, fontSize: 15, fontFamily: fonts.body },
});
