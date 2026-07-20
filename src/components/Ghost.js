import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { COLORS } from '../constants/theme';

// The app's wait state: a soft pulsing bar — skeleton-style "ghosted" waiting
// instead of a spinning wheel. Drop-in replacement for ActivityIndicator
// (same size/color/style props), so busy buttons and loading screens read as
// a calm placeholder rather than a spinner.
export default function Ghost({ size = 'small', color, style }) {
  const pulse = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.75, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.3, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const large = size === 'large';
  const w = typeof size === 'number' ? size : large ? 52 : 34;
  const h = large ? 7 : 5;

  return (
    <Animated.View
      style={[
        {
          width: w, height: h, borderRadius: 999,
          backgroundColor: color || COLORS.textMuted,
          opacity: pulse, alignSelf: 'center',
        },
        style,
      ]}
    />
  );
}
