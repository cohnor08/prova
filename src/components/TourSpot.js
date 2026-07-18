import React, { useRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';

// Registry that lets the full feature tour spotlight REAL on-screen elements.
// Wrap a section in <TourSpot id="..." style={...}> (drop-in for its View —
// same style, so layout is untouched) and the tour can find, scroll to, and
// draw a cut-out around it. Screens with scrollable content also register
// their ScrollView so off-screen targets can be brought into view.

const targets = new Map();   // id -> ref to the wrapping View
const scrollers = new Map(); // screen key -> ref to that screen's ScrollView

export const getTourTarget = (id) => targets.get(id) || null;
export const getTourScroller = (key) => scrollers.get(key) || null;

// Two usages:
//  • Marker (no children): `<TourSpot id="x" />` dropped as the first child
//    INSIDE a container — renders an invisible absolute-fill view, so
//    measuring it measures the container. Zero layout impact.
//  • Wrapper (children): `<TourSpot id="x">{...}</TourSpot>` around a block.
export function TourSpot({ id, style, children }) {
  const ref = useRef(null);
  useEffect(() => {
    targets.set(id, ref);
    return () => { if (targets.get(id) === ref) targets.delete(id); };
  }, [id]);
  // collapsable={false} keeps the view measurable on Android.
  if (children == null) {
    return <View ref={ref} collapsable={false} pointerEvents="none" style={StyleSheet.absoluteFill} />;
  }
  return <View ref={ref} collapsable={false} style={style}>{children}</View>;
}

// Call from a screen to make its ScrollView reachable by the tour:
//   const scrollRef = useTourScroller('TodayHome');
//   <ScrollView ref={scrollRef} ...>
export function useTourScroller(key) {
  const ref = useRef(null);
  useEffect(() => {
    scrollers.set(key, ref);
    return () => { if (scrollers.get(key) === ref) scrollers.delete(key); };
  }, [key]);
  return ref;
}
