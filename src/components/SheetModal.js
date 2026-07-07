import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, Animated, StyleSheet, TouchableWithoutFeedback, KeyboardAvoidingView,
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
  centered = false, keyboardAvoiding = false, dismissOnBackdrop = false, onClosed,
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);
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

  if (!mounted) return null;

  const kavEnabled = keyboardAvoiding === true || (keyboardAvoiding === 'android' && Platform.OS === 'android');
  const slide = {
    transform: [{
      translateY: anim.interpolate({
        inputRange: [0, 1],
        outputRange: [Dimensions.get('window').height, 0],
      }),
    }],
  };

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
