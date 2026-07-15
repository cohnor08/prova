import React from 'react';
import { View } from 'react-native';
import Svg, { Line, Circle, Rect, Text as SvgText } from 'react-native-svg';
import { COLORS } from '../constants/theme';
import { useThemeSync } from '../lib/ThemeContext';
import { NOTE_NAMES, OPEN_STRINGS } from '../constants/scales';

// Maps a scale (root + intervals) across the whole neck: a dot on every fret
// whose note is in the scale, with the root note highlighted.
function ScaleDiagram({ rootIndex, intervals }) {
  useThemeSync();
  const FRETS = 12;
  const FW = 24;   // fret-space width
  const SH = 20;   // string spacing
  const PAD_LEFT = 26;   // string labels + open column
  const PAD_TOP = 8;
  const PAD_BOTTOM = 20; // fret numbers below

  const boardW = FW * FRETS;
  const boardH = SH * (OPEN_STRINGS.length - 1);
  const W = PAD_LEFT + boardW + 10;
  const H = PAD_TOP + boardH + PAD_BOTTOM;

  const inScale = new Set(intervals.map((i) => (rootIndex + i) % 12));
  const line = COLORS.textMuted;

  const stringY = (r) => PAD_TOP + r * SH;
  const wireX = (f) => PAD_LEFT + f * FW;          // fret wire (0 = nut)
  const dotX = (f) => (f === 0 ? PAD_LEFT : PAD_LEFT + (f - 0.5) * FW); // open sits on the nut

  const INLAYS = [3, 5, 7, 9];

  return (
    <View>
      <Svg width={W} height={H}>
        {/* inlay markers (down the middle) */}
        {INLAYS.map((f) => (
          <Circle key={`in${f}`} cx={PAD_LEFT + (f - 0.5) * FW} cy={PAD_TOP + boardH / 2} r={3} fill={COLORS.border} />
        ))}
        <Circle cx={PAD_LEFT + (12 - 0.5) * FW} cy={stringY(1)} r={3} fill={COLORS.border} />
        <Circle cx={PAD_LEFT + (12 - 0.5) * FW} cy={stringY(4)} r={3} fill={COLORS.border} />

        {/* fret wires (nut is thicker) */}
        {Array.from({ length: FRETS + 1 }).map((_, f) => (
          f === 0
            ? <Rect key="nut" x={PAD_LEFT - 1.5} y={PAD_TOP} width={3} height={boardH} fill={COLORS.textSecondary} />
            : <Line key={`w${f}`} x1={wireX(f)} y1={PAD_TOP} x2={wireX(f)} y2={PAD_TOP + boardH} stroke={line} strokeWidth={1} />
        ))}
        {/* strings + labels */}
        {OPEN_STRINGS.map((s, r) => (
          <React.Fragment key={`s${r}`}>
            <SvgText x={8} y={stringY(r) + 3.5} fill={COLORS.textMuted} fontSize={9} fontWeight="700" textAnchor="middle">{s.label}</SvgText>
            <Line x1={PAD_LEFT} y1={stringY(r)} x2={PAD_LEFT + boardW} y2={stringY(r)} stroke={line} strokeWidth={1} />
          </React.Fragment>
        ))}

        {/* fret numbers */}
        {[3, 5, 7, 9, 12].map((f) => (
          <SvgText key={`fn${f}`} x={PAD_LEFT + (f - 0.5) * FW} y={PAD_TOP + boardH + 13} fill={COLORS.textMuted} fontSize={9} fontWeight="600" textAnchor="middle">{f}</SvgText>
        ))}

        {/* scale notes */}
        {OPEN_STRINGS.map((s, r) =>
          Array.from({ length: FRETS + 1 }).map((_, f) => {
            if (f === 0) return null; // no open-string notes — fretted positions only
            const pc = (s.pc + f) % 12;
            if (!inScale.has(pc)) return null;
            const isRoot = pc === rootIndex;
            const cx = dotX(f);
            const cy = stringY(r);
            return (
              <React.Fragment key={`n${r}-${f}`}>
                <Circle
                  cx={cx} cy={cy} r={8.5}
                  fill={isRoot ? COLORS.primary : COLORS.primary + '26'}
                  stroke={COLORS.primary}
                  strokeWidth={isRoot ? 0 : 1}
                />
                <SvgText x={cx} y={cy + 3} fill={isRoot ? '#fff' : COLORS.primary} fontSize={7.5} fontWeight="800" textAnchor="middle">
                  {NOTE_NAMES[pc]}
                </SvgText>
              </React.Fragment>
            );
          }),
        )}
      </Svg>
    </View>
  );
}

export default React.memo(ScaleDiagram);
