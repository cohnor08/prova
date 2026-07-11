import React from 'react';
import { View } from 'react-native';
import Svg, { Line, Circle, Rect, Text as SvgText } from 'react-native-svg';
import { COLORS } from '../constants/theme';

// Renders a guitar chord as a fretboard diagram.
// `frets` = [low E … high E], -1 muted / 0 open / n fret. `fingers` optional.
//
// The base fret (where the drawn window starts) is derived from the shape so
// barre chords further up the neck render correctly with a "3fr"-style label.
function ChordDiagram({ frets, fingers, scale = 1 }) {
  const STR = 6;        // strings
  const FRETS = 4;      // fret rows drawn
  const CW = 18 * scale; // gap between strings
  const RH = 24 * scale; // gap between frets
  const PAD_TOP = 20 * scale;   // room for the × / ○ markers
  const PAD_LEFT = 32 * scale;  // left gutter that holds the base-fret label
  const PAD_RIGHT = 14 * scale;
  const DOT = 7.5 * scale;

  const boardW = CW * (STR - 1);
  const boardH = RH * FRETS;
  const W = PAD_LEFT + boardW + PAD_RIGHT;
  const H = PAD_TOP + boardH + 6 * scale;

  const pressed = frets.filter((f) => f > 0);
  const maxF = pressed.length ? Math.max(...pressed) : 0;
  const minF = pressed.length ? Math.min(...pressed) : 0;
  // Open-position shapes (nothing above the 4th fret) start at the nut; higher
  // shapes start at their lowest fretted note.
  const baseFret = maxF <= FRETS ? 1 : minF;
  const openPos = baseFret === 1;

  const stringX = (i) => PAD_LEFT + i * CW;
  const fretY = (r) => PAD_TOP + r * RH;

  const line = COLORS.textMuted;

  return (
    <View>
      <Svg width={W} height={H}>
        {/* nut (open position) */}
        {openPos && (
          <Rect x={PAD_LEFT} y={PAD_TOP - 2 * scale} width={boardW} height={3 * scale} fill={COLORS.textSecondary} />
        )}
        {/* base-fret label for barre shapes */}
        {!openPos && (
          <SvgText
            x={11 * scale}
            y={fretY(0) + RH * 0.62}
            fill={COLORS.textSecondary}
            fontSize={10 * scale}
            fontWeight="700"
            textAnchor="middle"
          >
            {baseFret}fr
          </SvgText>
        )}

        {/* fret lines */}
        {Array.from({ length: FRETS + 1 }).map((_, r) => (
          <Line key={`f${r}`} x1={PAD_LEFT} y1={fretY(r)} x2={PAD_LEFT + boardW} y2={fretY(r)} stroke={line} strokeWidth={1} />
        ))}
        {/* string lines */}
        {Array.from({ length: STR }).map((_, i) => (
          <Line key={`s${i}`} x1={stringX(i)} y1={PAD_TOP} x2={stringX(i)} y2={PAD_TOP + boardH} stroke={line} strokeWidth={1} />
        ))}

        {/* per-string markers + dots */}
        {frets.map((f, i) => {
          const x = stringX(i);
          if (f < 0) {
            return (
              <SvgText key={`m${i}`} x={x} y={PAD_TOP - 6 * scale} fill={COLORS.textMuted} fontSize={11 * scale} fontWeight="700" textAnchor="middle">×</SvgText>
            );
          }
          if (f === 0) {
            return (
              <Circle key={`m${i}`} cx={x} cy={PAD_TOP - 9 * scale} r={4 * scale} stroke={COLORS.textSecondary} strokeWidth={1.3} fill="none" />
            );
          }
          const pos = f - baseFret + 1; // 1..FRETS
          const cy = PAD_TOP + (pos - 0.5) * RH;
          const finger = fingers ? fingers[i] : 0;
          return (
            <React.Fragment key={`m${i}`}>
              <Circle cx={x} cy={cy} r={DOT} fill={COLORS.primary} />
              {finger > 0 && (
                <SvgText x={x} y={cy + 3.5 * scale} fill="#fff" fontSize={9.5 * scale} fontWeight="800" textAnchor="middle">{finger}</SvgText>
              )}
            </React.Fragment>
          );
        })}
      </Svg>
    </View>
  );
}

// Chord shapes are static, so a mounted diagram never needs to re-render —
// memoising keeps filtering the library smooth.
export default React.memo(ChordDiagram);
