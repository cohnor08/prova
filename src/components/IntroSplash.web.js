// Web twin of IntroSplash — the brand SVG animation renders natively in the
// browser (no WebView needed). Same behaviour: plays once, tap to skip.
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, TouchableWithoutFeedback } from 'react-native';

const INTRO_MS = 3500;
const FADE_MS = 420;

function IntroSplash({ onDone }) {
  const fade = useRef(new Animated.Value(1)).current;
  const doneRef = useRef(false);
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    Animated.timing(fade, { toValue: 0, duration: FADE_MS, useNativeDriver: false })
      .start(() => onDone && onDone());
  };
  useEffect(() => { const t = setTimeout(finish, INTRO_MS); return () => clearTimeout(t); }, []);
  return (
    <TouchableWithoutFeedback onPress={finish}>
      <Animated.View style={[styles.root, { opacity: fade }]}>
        <View style={styles.center}>
          <div style={{ width: 'min(82vw, 420px)' }} dangerouslySetInnerHTML={{ __html: SVG }} />
        </View>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

// Freeze: the intro plays exactly once — parent re-renders (auth resolving,
// role loading) must never rebuild its DOM or the animation restarts.
export default React.memo(IntroSplash, () => true);

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: '#050810', zIndex: 9999 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

const SVG = `
<svg width="100%" viewBox="0 0 400 680" xmlns="http://www.w3.org/2000/svg">
<style>
.bg { fill: #050810; }
.cd-group { opacity:0; animation:groupIn 0.01s ease forwards; animation-delay:0.15s; transform:translateY(-14px) scale(1.32); transform-origin:200px 275px; }
@keyframes groupIn { to { opacity:1; } }
.cd-outer  { fill:#0a0f1a; stroke:#3B82F6; stroke-width:9; stroke-dasharray:251; stroke-dashoffset:251; animation:drawCircle 0.9s ease forwards; animation-delay:0.15s; }
.cd-mid    { fill:none; stroke:#1E40AF; stroke-width:3; stroke-dasharray:233; stroke-dashoffset:233; animation:drawCircle 1.0s ease forwards; animation-delay:0.25s; }
.cd-hole   { fill:#050810; stroke:#3B82F6; stroke-width:2; opacity:0; animation:fadeIn 0.4s ease forwards; animation-delay:0.95s; }
.ring-in   { fill:none; stroke:#2563EB; stroke-width:1; stroke-dasharray:5 15; opacity:0; transform-origin:200px 275px; animation:spinIn 10s linear infinite; animation-delay:0.75s; }
.ring-out  { fill:none; stroke:#1D4ED8; stroke-width:1; stroke-dasharray:3 12; opacity:0; transform-origin:200px 275px; animation:spinRev 14s linear infinite; animation-delay:0.85s; }
@keyframes drawCircle { to { stroke-dashoffset:0; } }
@keyframes fadeIn     { to { opacity:1; } }
@keyframes spinIn     { 0%{opacity:0;transform:rotate(0deg)} 8%{opacity:1} 100%{opacity:1;transform:rotate(360deg)} }
@keyframes spinRev    { 0%{opacity:0;transform:rotate(0deg)} 8%{opacity:1} 100%{opacity:1;transform:rotate(-360deg)} }
.word    { animation:wordIn 0.9s cubic-bezier(.2,.7,.3,1) forwards; animation-delay:1.15s; opacity:0; }
@keyframes wordIn { from{opacity:0;letter-spacing:44px;transform:translateY(10px)} to{opacity:1;letter-spacing:14px;transform:translateY(0)} }
.theline { animation:lineIn 0.9s ease forwards; animation-delay:1.3s; opacity:0; transform-origin:200px 408px; }
@keyframes lineIn { from{opacity:0;transform:scaleX(0.2)} to{opacity:0.8;transform:scaleX(1)} }
.tag     { animation:tagIn 0.7s ease forwards; animation-delay:1.85s; opacity:0; }
@keyframes tagIn { from{opacity:0;letter-spacing:11px} to{opacity:1;letter-spacing:5px} }
.dots    { animation:fadeUp 0.5s ease forwards; animation-delay:2.15s; opacity:0; }
@keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
.glow  { opacity:0; animation:fadeIn 1.4s ease forwards; animation-delay:0.55s; }
.burst { fill:none; stroke:#3B82F6; stroke-width:2; opacity:0; transform-origin:200px 261px; animation:burst 0.9s ease-out forwards; animation-delay:1.05s; }
@keyframes burst { 0%{opacity:0.7;transform:scale(0.55)} 100%{opacity:0;transform:scale(1.9)} }
.dotmid { animation:dotPulse 1.8s ease-in-out infinite; animation-delay:2.6s; }
@keyframes dotPulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
</style>
<rect width="400" height="680" class="bg" rx="16"/>
<defs><radialGradient id="glowGrad"><stop offset="0" stop-color="#3B82F6" stop-opacity="0.20"/><stop offset="1" stop-color="#3B82F6" stop-opacity="0"/></radialGradient></defs>
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
