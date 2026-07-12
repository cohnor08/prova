// Animated startup intro — plays the brand animation (soundwave pulses →
// morphs into the CD ring → PROVA fades in) on cold start, then fades into
// the app. The animation is the original brand SVG (CSS-animated), rendered
// pixel-perfect in a WebView. Tap anywhere to skip. Rendered as an overlay
// ABOVE the whole app so auth/data can load underneath while it plays.
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, TouchableWithoutFeedback } from 'react-native';
import { WebView } from 'react-native-webview';

// Total runtime of the SVG's timeline (last element finishes ~5.5s) + a beat.
const INTRO_MS = 5800;
const FADE_MS = 420;

const SVG = `
<svg width="400" height="680" viewBox="0 0 400 680" xmlns="http://www.w3.org/2000/svg">
<style>
.bg { fill: #050810; }
.bar1 { fill: #7CB1FC; } .bar2 { fill: #60A5FA; } .bar3 { fill: #3B82F6; }
.bar4 { fill: #2563EB; } .bar5 { fill: #1D4ED8; }
@keyframes pulse1  { 0%,100%{height:8px;y:276px}  50%{height:55px;y:253px} }
@keyframes pulse2  { 0%,100%{height:16px;y:272px} 50%{height:85px;y:238px} }
@keyframes pulse3  { 0%,100%{height:28px;y:266px} 50%{height:110px;y:225px} }
@keyframes pulse4  { 0%,100%{height:44px;y:258px} 50%{height:135px;y:213px} }
@keyframes pulse5  { 0%,100%{height:64px;y:248px} 50%{height:155px;y:203px} }
@keyframes pulse6  { 0%,100%{height:88px;y:236px} 50%{height:168px;y:196px} }
@keyframes pulse7  { 0%,100%{height:104px;y:228px} 50%{height:176px;y:192px} }
@keyframes pulse8  { 0%,100%{height:88px;y:236px} 50%{height:168px;y:196px} }
@keyframes pulse9  { 0%,100%{height:64px;y:248px} 50%{height:155px;y:203px} }
@keyframes pulse10 { 0%,100%{height:44px;y:258px} 50%{height:135px;y:213px} }
@keyframes pulse11 { 0%,100%{height:28px;y:266px} 50%{height:110px;y:225px} }
@keyframes pulse12 { 0%,100%{height:16px;y:272px} 50%{height:85px;y:238px} }
@keyframes pulse13 { 0%,100%{height:8px;y:276px}  50%{height:55px;y:253px} }
.b1{animation:pulse1 0.8s ease-in-out infinite;animation-delay:0.00s}
.b2{animation:pulse2 0.8s ease-in-out infinite;animation-delay:0.06s}
.b3{animation:pulse3 0.8s ease-in-out infinite;animation-delay:0.12s}
.b4{animation:pulse4 0.8s ease-in-out infinite;animation-delay:0.18s}
.b5{animation:pulse5 0.8s ease-in-out infinite;animation-delay:0.24s}
.b6{animation:pulse6 0.8s ease-in-out infinite;animation-delay:0.30s}
.b7{animation:pulse7 0.8s ease-in-out infinite;animation-delay:0.36s}
.b8{animation:pulse8 0.8s ease-in-out infinite;animation-delay:0.42s}
.b9{animation:pulse9 0.8s ease-in-out infinite;animation-delay:0.48s}
.b10{animation:pulse10 0.8s ease-in-out infinite;animation-delay:0.54s}
.b11{animation:pulse11 0.8s ease-in-out infinite;animation-delay:0.60s}
.b12{animation:pulse12 0.8s ease-in-out infinite;animation-delay:0.66s}
.b13{animation:pulse13 0.8s ease-in-out infinite;animation-delay:0.72s}
.wave-group { animation: waveFade 0.7s ease forwards; animation-delay: 2.4s; transform-origin: 200px 280px; }
@keyframes waveFade { from{opacity:1;transform:scale(1)} to{opacity:0;transform:scale(0.15)} }
.cd-group { opacity:0; animation:groupIn 0.01s ease forwards; animation-delay:3.0s; transform:translateY(-14px) scale(1.32); transform-origin:200px 275px; }
@keyframes groupIn { to { opacity:1; } }
.cd-outer  { fill:#0a0f1a; stroke:#3B82F6; stroke-width:9; stroke-dasharray:251; stroke-dashoffset:251; animation:drawCircle 0.9s ease forwards; animation-delay:3.0s; }
.cd-mid    { fill:none; stroke:#1E40AF; stroke-width:3; stroke-dasharray:233; stroke-dashoffset:233; animation:drawCircle 1.0s ease forwards; animation-delay:3.1s; }
.cd-hole   { fill:#050810; stroke:#3B82F6; stroke-width:2; opacity:0; animation:fadeIn 0.4s ease forwards; animation-delay:3.8s; }
.ring-in   { fill:none; stroke:#2563EB; stroke-width:1; stroke-dasharray:5 15; opacity:0; transform-origin:200px 275px; animation:spinIn 10s linear infinite; animation-delay:3.6s; }
.ring-out  { fill:none; stroke:#1D4ED8; stroke-width:1; stroke-dasharray:3 12; opacity:0; transform-origin:200px 275px; animation:spinRev 14s linear infinite; animation-delay:3.7s; }
@keyframes drawCircle { to { stroke-dashoffset:0; } }
@keyframes fadeIn     { to { opacity:1; } }
@keyframes spinIn     { 0%{opacity:0;transform:rotate(0deg)} 8%{opacity:1} 100%{opacity:1;transform:rotate(360deg)} }
@keyframes spinRev    { 0%{opacity:0;transform:rotate(0deg)} 8%{opacity:1} 100%{opacity:1;transform:rotate(-360deg)} }
.word    { animation:wordIn 0.9s cubic-bezier(.2,.7,.3,1) forwards; animation-delay:4.0s; opacity:0; }
@keyframes wordIn { from{opacity:0;letter-spacing:44px;transform:translateY(10px)} to{opacity:1;letter-spacing:14px;transform:translateY(0)} }
.theline { animation:lineIn 0.9s ease forwards; animation-delay:4.15s; opacity:0; transform-origin:200px 408px; }
@keyframes lineIn { from{opacity:0;transform:scaleX(0.2)} to{opacity:0.8;transform:scaleX(1)} }
.tag     { animation:tagIn 0.7s ease forwards; animation-delay:4.7s; opacity:0; }
@keyframes tagIn { from{opacity:0;letter-spacing:11px} to{opacity:1;letter-spacing:5px} }
.dots    { animation:fadeUp 0.5s ease forwards; animation-delay:5.0s; opacity:0; }
@keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
.glow  { opacity:0; animation:fadeIn 1.4s ease forwards; animation-delay:3.4s; }
.burst { fill:none; stroke:#3B82F6; stroke-width:2; opacity:0; transform-origin:200px 261px; animation:burst 0.9s ease-out forwards; animation-delay:3.9s; }
@keyframes burst { 0%{opacity:0.7;transform:scale(0.55)} 100%{opacity:0;transform:scale(1.9)} }
.dotmid { animation:dotPulse 1.8s ease-in-out infinite; animation-delay:5.5s; }
@keyframes dotPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
</style>
<rect width="400" height="680" class="bg" rx="16"/>
<g class="wave-group">
  <rect class="bar1 b1"  x="112" y="276" width="9" height="8"   rx="3"/>
  <rect class="bar2 b2"  x="126" y="272" width="9" height="16"  rx="3"/>
  <rect class="bar3 b3"  x="140" y="266" width="9" height="28"  rx="3"/>
  <rect class="bar4 b4"  x="154" y="258" width="9" height="44"  rx="3"/>
  <rect class="bar5 b5"  x="168" y="248" width="9" height="64"  rx="3"/>
  <rect class="bar4 b6"  x="182" y="236" width="9" height="88"  rx="3"/>
  <rect class="bar3 b7"  x="196" y="228" width="9" height="104" rx="3"/>
  <rect class="bar4 b8"  x="210" y="236" width="9" height="88"  rx="3"/>
  <rect class="bar5 b9"  x="224" y="248" width="9" height="64"  rx="3"/>
  <rect class="bar4 b10" x="238" y="258" width="9" height="44"  rx="3"/>
  <rect class="bar3 b11" x="252" y="266" width="9" height="28"  rx="3"/>
  <rect class="bar2 b12" x="266" y="272" width="9" height="16"  rx="3"/>
  <rect class="bar1 b13" x="280" y="276" width="9" height="8"   rx="3"/>
</g>
<defs>
  <radialGradient id="glowGrad">
    <stop offset="0" stop-color="#3B82F6" stop-opacity="0.20"/>
    <stop offset="1" stop-color="#3B82F6" stop-opacity="0"/>
  </radialGradient>
</defs>
<circle class="glow" cx="200" cy="261" r="150" fill="url(#glowGrad)"/>
<g class="cd-group">
  <circle cx="200" cy="275" r="40" class="cd-outer"/>
  <circle cx="200" cy="275" r="37" class="cd-mid"/>
  <circle cx="200" cy="275" r="6"  class="cd-hole"/>
  <circle cx="200" cy="275" r="50" class="ring-in"/>
  <circle cx="200" cy="275" r="62" class="ring-out"/>
</g>
<circle class="burst" cx="200" cy="261" r="92"/>
<rect x="75" y="408" width="250" height="1" fill="#3B82F6" opacity="0.8" class="theline"/>
<text x="200" y="400" text-anchor="middle" fill="#F0F4FF" font-family="Georgia, serif" font-size="52" font-weight="400" letter-spacing="14" class="word">PROVA</text>
<text x="200" y="432" text-anchor="middle" fill="#60A5FA" font-family="Arial, sans-serif" font-size="10" letter-spacing="5" class="tag">PLAY. PRACTICE. PERFORM.</text>
<g class="dots">
  <circle cx="160" cy="458" r="2" fill="#1E40AF"/>
  <circle cx="200" cy="458" r="2" fill="#3B82F6" class="dotmid"/>
  <circle cx="240" cy="458" r="2" fill="#1E40AF"/>
</g>
</svg>`;

const HTML = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>html,body{margin:0;height:100%;background:#050810;display:flex;align-items:center;justify-content:center;overflow:hidden}svg{width:82vw;max-width:420px;height:auto}</style>
</head><body>${SVG}</body></html>`;

export default function IntroSplash({ onDone }) {
  const fade = useRef(new Animated.Value(1)).current;
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    Animated.timing(fade, { toValue: 0, duration: FADE_MS, useNativeDriver: true })
      .start(() => onDone && onDone());
  };

  useEffect(() => {
    const t = setTimeout(finish, INTRO_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <TouchableWithoutFeedback onPress={finish}>
      <Animated.View style={[styles.root, { opacity: fade }]}>
        <View style={styles.inner} pointerEvents="none">
          <WebView
            source={{ html: HTML }}
            style={styles.web}
            scrollEnabled={false}
            bounces={false}
            javaScriptEnabled={false}
            originWhitelist={['*']}
            backgroundColor="#050810"
          />
        </View>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: '#050810', zIndex: 9999 },
  inner: { flex: 1 },
  web: { flex: 1, backgroundColor: '#050810' },
});
