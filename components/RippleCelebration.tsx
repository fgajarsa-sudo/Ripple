import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { colors } from '../lib/theme';

const RING_COUNT = 4;
const RING_SIZE = 220;
const STAGGER_MS = 220;
const DURATION_MS = 1400;

export function RippleCelebration() {
  const progress = useRef(Array.from({ length: RING_COUNT }, () => new Animated.Value(0))).current;

  useEffect(() => {
    const animations = progress.map((value, i) =>
      Animated.timing(value, {
        toValue: 1,
        duration: DURATION_MS,
        delay: i * STAGGER_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    Animated.parallel(animations).start();
  }, [progress]);

  return (
    <View style={styles.wrap} pointerEvents="none">
      {progress.map((value, i) => (
        <Animated.View
          key={i}
          style={[
            styles.ring,
            {
              opacity: value.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] }),
              transform: [
                {
                  scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 3,
    borderColor: colors.teal,
  },
});
