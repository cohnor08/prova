import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, Animated, StyleSheet, TouchableWithoutFeedback, KeyboardAvoidingView, Keyboard, Easing,
  Platform, Dimensions,
} from 'react-native';

// Bottom-sheet modal with the correct dismiss feel: the dim backdrop FADES
// while only the card slides. RN Modal's animationType="slide" animates the
// whole thing as one piece, so the dark overlay visibly slides down on close
// (the "faint black screen" artifact).
//
// Props:
//   visible / onRequestClose — as on Modal (hardware back calls onRequestClose)
//   cardStyle           — the sheet card's style (bg, radius, padding)
//   centered            — center the card instead of pinning to the bottom
//   keyboardAvoiding    — true = KAV both platforms; 'android' = Android only
//   keyboardLift        — lift the card by the keyboard's own height instead.
//                         KeyboardAvoidingView measures against the window, and
//                         inside a Modal on iOS that measurement is wrong often
//                         enough that the keyboard just covers the field. This
//                         drives translateY straight off the keyboard event, so
//                         it uses the keyboard's exact height AND duration and
//                         moves in step with it. Prefer this for sheets with an
//                         input; it composes with the slide-in transform.
//                         (for cards whose iOS keyboard handling lives inside,
//                         e.g. a ScrollView with automaticallyAdjustKeyboardInsets)
//   dismissOnBackdrop   — tap the dim to close; off by default so form sheets
//                         can't be discarded mid-typing
//   onClosed            — fires after the exit animation fully unmounts the
//                         Modal. iOS can only present one modal at a time, so
//                         anything that opens ANOTHER modal on close must wait
//                         for this (opening early freezes the screen).
export default function SheetModal({
  visible, onRequestClose, children, cardStyle,
  centered = false, keyboardAvoiding = false, keyboardLift = false, dismissOnBackdrop = false, onClosed,
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
  const kbLift = useRef(new Animated.Value(0)).current;   // keyboard lift, native-driven
  // Children can depend on state the parent nulls on close (visible={!!obj}) —
  // keep rendering the last visible tree while the exit animation plays.
  const lastChildren = useRef(children);
  if (visible) lastChildren.current = children;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 240, useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(anim, { toValue: 0, duration: 190, useNativeDriver: true }).start(() => {
        setMounted(false);
        if (onClosed) onClosed();
      });
    }
  }, [visible]);

  // Keyboard lift — native-driven so it stays in lockstep with the slide.
  useEffect(() => {
    if (!keyboardLift) return undefined;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const move = (to, duration) => Animated.timing(kbLift, {
      toValue: to, duration: duration || 250, easing: Easing.out(Easing.ease), useNativeDriver: true,
    }).start();
    const onShow = (e) => move(-(e.endCoordinates?.height || 300), e.duration);
    const onHide = (e) => move(0, e?.duration);
    const subShow = Keyboard.addListener(showEvt, onShow);
    const subHide = Keyboard.addListener(hideEvt, onHide);
    return () => { subShow.remove(); subHide.remove(); };
  }, [keyboardLift]);

  if (!mounted) return null;

  const kavEnabled = !keyboardLift && (keyboardAvoiding === true || (keyboardAvoiding === 'android' && Platform.OS === 'android'));
  const slideY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [Dimensions.get('window').height, 0],
  });
  // Both translateYs live in ONE transform array — RN can't mix a native-driven
  // and a JS-driven animation on the same node, so both are native.
  const slide = { transform: keyboardLift ? [{ translateY: slideY }, { translateY: kbLift }] : [{ translateY: slideY }] };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onRequestClose}>
      <KeyboardAvoidingView
        style={[styles.root, centered && styles.rootCentered]}
        behavior={kavEnabled ? (Platform.OS === 'ios' ? 'padding' : 'height') : undefined}
        enabled={kavEnabled}
      >
        <TouchableWithoutFeedback onPress={dismissOnBackdrop ? onRequestClose : undefined} accessible={false}>
          {/* The dim leads the card out: fully gone 40% into the exit, so no
              faint dark flash lingers after the card has left the screen. */}
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.dim, {
              opacity: anim.interpolate({ inputRange: [0.6, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
            }]}
          />
        </TouchableWithoutFeedback>
        <Animated.View style={[cardStyle, slide]}>
          {visible ? children : lastChildren.current}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  rootCentered: { justifyContent: 'center', paddingHorizontal: 24 },
  dim: { backgroundColor: 'rgba(0,0,0,0.7)' },
});
