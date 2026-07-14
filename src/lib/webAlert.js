// Alert.alert is a silent no-op in react-native-web, which kills every
// confirm / error / choice dialog on the website — the button appears dead.
// This swaps in a DOM-rendered dialog styled like the app. Installed once
// from App.js (web only). Queued like native: one dialog at a time.
import { Alert } from 'react-native';
import { COLORS } from '../constants/theme';

const queue = [];
let showing = false;

function el(tag, css, text) {
  const e = document.createElement(tag);
  Object.assign(e.style, css);
  if (text != null) e.textContent = text;
  return e;
}

function present({ title, message, buttons, options }) {
  showing = true;
  const btns = Array.isArray(buttons) && buttons.length > 0 ? buttons : [{ text: 'OK' }];

  const overlay = el('div', {
    position: 'fixed', inset: '0', zIndex: '100000',
    background: 'rgba(2,4,10,0.72)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: '24px',
    // the body>div column CSS in App.js sets pointer-events:none on portals
    pointerEvents: 'auto', boxSizing: 'border-box',
  });
  const card = el('div', {
    background: COLORS.surface, border: '1px solid #1E2D4A', borderRadius: '16px',
    padding: '22px', width: '100%', maxWidth: '320px', boxSizing: 'border-box',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  });
  if (title) card.appendChild(el('div', { color: COLORS.text, fontSize: '16px', fontWeight: '800' }, String(title)));
  if (message) card.appendChild(el('div', { color: COLORS.textSecondary, fontSize: '14px', lineHeight: '1.45', marginTop: title ? '8px' : '0', whiteSpace: 'pre-wrap' }, String(message)));

  const row = el('div', {
    display: 'flex', gap: btns.length === 2 ? '10px' : '8px', marginTop: '18px',
    flexDirection: btns.length === 2 ? 'row' : 'column',
  });

  const close = (fn) => {
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    showing = false;
    try { fn && fn(); } catch (e) { /* never block the queue */ }
    if (queue.length) present(queue.shift());
  };
  const cancelBtn = btns.find((b) => b.style === 'cancel');
  const onKey = (e) => {
    if (e.key === 'Escape' && cancelBtn) { e.stopPropagation(); close(cancelBtn.onPress); }
  };
  document.addEventListener('keydown', onKey, true);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay && cancelBtn && options?.cancelable !== false) close(cancelBtn.onPress);
  });

  btns.forEach((b) => {
    const destructive = b.style === 'destructive';
    const cancel = b.style === 'cancel';
    const btn = el('button', {
      flex: btns.length === 2 ? '1' : 'none', padding: '11px 14px', borderRadius: '10px',
      fontSize: '14px', fontWeight: '700', cursor: 'pointer',
      border: cancel ? '1px solid #2A3A5C' : 'none',
      background: cancel ? 'transparent' : destructive ? '#DC2626' : COLORS.primary,
      color: cancel ? COLORS.textSecondary : '#fff',
    }, b.text || 'OK');
    btn.addEventListener('click', () => close(b.onPress));
    row.appendChild(btn);
  });

  card.appendChild(row);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

export function installWebAlert() {
  Alert.alert = (title, message, buttons, options) => {
    const item = { title, message, buttons, options };
    if (showing) queue.push(item);
    else present(item);
  };
}
