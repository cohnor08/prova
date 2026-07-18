import { useEffect, useRef } from 'react';
import { Animated, Easing, Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Bottom padding for a chat input bar that sits flush on the keyboard:
// = safe-area (min 10) when the keyboard is down, = keyboard height (+ a small
// gap) while it's up. The padding lives ON the input bar — surface colour — so
// the space under the field can never show as a dark gap, even mid-animation.
// Driven by the keyboard's own event (it carries the exact height AND duration),
// unlike KeyboardAvoidingView which animates on its own timing and leaves the
// input row's static safe-area padding as a dead band above the keyboard.
// (Same pattern AskProvaScreen settled on after the PR #64 keyboard saga.)
export function useKeyboardInset(extraGap = 6) {
  const insets = useSafeAreaInsets();
  const rest = Math.max(insets.bottom, 10);
  const kbInset = useRef(new Animated.Value(rest)).current;

  useEffect(() => {
    const onShow = (e) => {
      Animated.timing(kbInset, {
        toValue: (e.endCoordinates?.height || 300) + extraGap,
        duration: e.duration || 250,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start();
    };
    const onHide = (e) => {
      Animated.timing(kbInset, {
        toValue: rest,
        duration: e.duration || 250,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start();
    };
    // iOS has will* events (fire as the animation starts); Android only did*.
    const s1 = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', onShow);
    const s2 = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', onHide);
    return () => { s1.remove(); s2.remove(); };
  }, [rest, kbInset, extraGap]);

  return kbInset;
}
