// Animated startup intro — the CD ring draws itself in, the rings spin up, and
// PROVA lands with the tagline (~3s total, tap to skip), then fades into the app.
// Rendered ABOVE the whole app so auth/data load underneath while it plays.
//
// This used to render the brand mark as CSS-animated SVG inside a WebView, and
// that was the source of the grey/white square that flashed for the first frames
// of every launch: a WKWebView paints its OWN surface before the page inside it
// paints, and no combination of `opaque={false}`, `backgroundColor` or a dark
// parent stops the surface itself from showing. Two attempts at suppressing it
// failed. There is no web view here any more — it's react-native-svg drawing
// straight onto the native view, so there is no second surface to flash.
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, TouchableWithoutFeedback } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { hideNativeSplash } from '../lib/nativeSplash';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Matches the old timeline: last element lands ~2.7s, then a hold on the
// finished logo before fading into the app.
const INTRO_MS = 3500;
const FADE_MS = 420;

const BOX = 200;          // drawing box for the mark
const C = BOX / 2;
const R_OUTER = 62;
const R_MID = 57;
const R_HOLE = 9;
const R_IN = 78;
const R_OUT = 92;
const CIRC = 2 * Math.PI * R_OUTER;
const CIRC_MID = 2 * Math.PI * R_MID;

// A dotted ring, spun by an Animated transform on its wrapper. Two of them,
// counter-rotating, same as the original.
function SpinRing({ r, colour, dash, spin, reverse }) {
  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: reverse ? ['0deg', '-360deg'] : ['0deg', '360deg'],
  });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate }] }]} pointerEvents="none">
      <Svg width={BOX} height={BOX}>
        <Circle cx={C} cy={C} r={r} fill="none" stroke={colour} strokeWidth={1} strokeDasharray={dash} />
      </Svg>
    </Animated.View>
  );
}

export default function IntroSplash({ onDone }) {
  const fade = useRef(new Animated.Value(1)).current;
  const doneRef = useRef(false);

  // strokeDashoffset can't run on the native driver, so the two ring draws are
  // the only JS-driven values here; everything else is native.
  const draw = useRef(new Animated.Value(1)).current;      // 1 -> 0 = ring draws
  const drawMid = useRef(new Animated.Value(1)).current;
  const markIn = useRef(new Animated.Value(0)).current;    // mark fade/scale
  const holeIn = useRef(new Animated.Value(0)).current;
  const ringsIn = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const wordIn = useRef(new Animated.Value(0)).current;
  const lineIn = useRef(new Animated.Value(0)).current;
  const tagIn = useRef(new Animated.Value(0)).current;
  const dotsIn = useRef(new Animated.Value(0)).current;

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    Animated.timing(fade, { toValue: 0, duration: FADE_MS, useNativeDriver: true })
      .start(() => onDone && onDone());
  };

  useEffect(() => {
    const ease = Easing.out(Easing.cubic);
    const at = (v, delay, duration, toValue = 1, native = true) =>
      Animated.timing(v, { toValue, delay, duration, easing: ease, useNativeDriver: native });

    Animated.parallel([
      at(markIn, 150, 220),
      at(draw, 150, 900, 0, false),
      at(drawMid, 250, 1000, 0, false),
      at(holeIn, 950, 400),
      at(ringsIn, 750, 500),
      at(burst, 1050, 900),
      at(wordIn, 1150, 900),
      at(lineIn, 1300, 900),
      at(tagIn, 1850, 700),
      at(dotsIn, 2150, 500),
    ]).start();

    // Continuous, so it must live outside the parallel block above.
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 10000, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();

    const t = setTimeout(finish, INTRO_MS);
    return () => { clearTimeout(t); loop.stop(); };
  }, []);

  return (
    <TouchableWithoutFeedback onPress={finish}>
      {/* Hand the native launch screen over only once this view has been laid
          out, so there is never an uncovered frame between the two. */}
      <Animated.View style={[styles.root, { opacity: fade }]} onLayout={hideNativeSplash}>
        <View style={styles.centre} pointerEvents="none">
          <Animated.View
            style={{
              width: BOX,
              height: BOX,
              opacity: markIn,
              transform: [{ scale: markIn.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }],
            }}
          >
            <Svg width={BOX} height={BOX}>
              <Defs>
                <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor="#5FC4F5" stopOpacity="0.20" />
                  <Stop offset="1" stopColor="#5FC4F5" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Circle cx={C} cy={C} r={98} fill="url(#glow)" />
              <AnimatedCircle
                cx={C} cy={C} r={R_OUTER} fill="#1E222B" stroke="#5FC4F5" strokeWidth={9}
                strokeDasharray={CIRC}
                strokeDashoffset={draw.interpolate({ inputRange: [0, 1], outputRange: [0, CIRC] })}
              />
              <AnimatedCircle
                cx={C} cy={C} r={R_MID} fill="none" stroke="#2E7FB8" strokeWidth={3}
                strokeDasharray={CIRC_MID}
                strokeDashoffset={drawMid.interpolate({ inputRange: [0, 1], outputRange: [0, CIRC_MID] })}
              />
            </Svg>

            <Animated.View style={[StyleSheet.absoluteFill, { opacity: ringsIn }]} pointerEvents="none">
              <SpinRing r={R_IN} colour="#8FCCEF" dash="5,15" spin={spin} />
              <SpinRing r={R_OUT} colour="#7FA0DD" dash="3,12" spin={spin} reverse />
            </Animated.View>

            {/* The burst ring expands out of the mark and fades. */}
            <Animated.View
              style={[StyleSheet.absoluteFill, {
                opacity: burst.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
                transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.9] }) }],
              }]}
              pointerEvents="none"
            >
              <Svg width={BOX} height={BOX}>
                <Circle cx={C} cy={C} r={R_OUTER + 8} fill="none" stroke="#5FC4F5" strokeWidth={2} />
              </Svg>
            </Animated.View>

            <Animated.View style={[StyleSheet.absoluteFill, { opacity: holeIn }]} pointerEvents="none">
              <Svg width={BOX} height={BOX}>
                <Circle cx={C} cy={C} r={R_HOLE} fill="#171A21" stroke="#5FC4F5" strokeWidth={2} />
              </Svg>
            </Animated.View>
          </Animated.View>

          <Animated.Text
            style={[styles.word, {
              opacity: wordIn,
              transform: [{ translateY: wordIn.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            }]}
          >
            PROVA
          </Animated.Text>

          <Animated.View
            style={[styles.line, {
              opacity: lineIn.interpolate({ inputRange: [0, 1], outputRange: [0, 0.8] }),
              transform: [{ scaleX: lineIn.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }],
            }]}
          />

          <Animated.Text style={[styles.tag, { opacity: tagIn }]}>PLAY. PRACTICE. PERFORM.</Animated.Text>

          <Animated.View
            style={[styles.dots, {
              opacity: dotsIn,
              transform: [{ translateY: dotsIn.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            }]}
          >
            <View style={[styles.dot, { backgroundColor: '#2E7FB8' }]} />
            <View style={[styles.dot, { backgroundColor: '#5FC4F5' }]} />
            <View style={[styles.dot, { backgroundColor: '#2E7FB8' }]} />
          </Animated.View>
        </View>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: '#171A21', zIndex: 9999 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  word: {
    color: '#F4F7FD', fontFamily: 'Georgia', fontSize: 46, letterSpacing: 14,
    marginTop: 34, marginLeft: 14, // letterSpacing pads the right edge; nudge back to centre
  },
  line: { width: 210, height: 1, backgroundColor: '#5FC4F5', marginTop: 14 },
  tag: { color: '#8FCCEF', fontSize: 10, letterSpacing: 5, marginTop: 16, marginLeft: 5 },
  dots: { flexDirection: 'row', gap: 36, marginTop: 22 },
  dot: { width: 4, height: 4, borderRadius: 2 },
});
