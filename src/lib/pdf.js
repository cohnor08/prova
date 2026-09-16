import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// Turns one of the sheets built in src/lib/printSheets.js into something the
// student can keep: on a phone a real PDF handed to the share sheet (Save to
// Files, Print, Mail, AirDrop); on web the browser's own print dialog, which
// is where "Save as PDF" lives.
//
// expo-print's web build just calls window.print() on the current page — it
// would print the app, not the sheet — so web gets its own iframe path.

const safeName = (name) => (String(name || 'Prova sheet')
  .replace(/[^A-Za-z0-9 ()#&_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim() || 'Prova sheet').slice(0, 60);

// Print an HTML string without navigating away: a hidden iframe, printed and
// then dropped. Nothing about the page the student is on changes.
function printHtmlOnWeb(html) {
  if (typeof document === 'undefined') return;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  frame.srcdoc = html;
  frame.onload = () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (e) { /* a blocked print dialog is not worth an error */ }
    // Safari needs the frame alive while its dialog is up.
    setTimeout(() => frame.remove(), 60000);
  };
  document.body.appendChild(frame);
}

export async function saveSheet(html, name) {
  if (Platform.OS === 'web') { printHtmlOnWeb(html); return true; }
  const { uri } = await Print.printToFileAsync({ html });
  // printToFileAsync names the file with a random id, which is what the share
  // sheet and Files would show. Rename it so what they save is called
  // "A Minor Pentatonic.pdf".
  let fileUri = uri;
  try {
    const { File } = require('expo-file-system');
    const f = new File(uri);
    f.rename(`${safeName(name)}.pdf`);
    if (f.uri) fileUri = f.uri;
  } catch (e) { /* keep the generated name */ }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: safeName(name),
    });
    return true;
  }
  // No share sheet (rare) — go straight to the system printer, which also
  // offers "Save as PDF".
  await Print.printAsync({ html });
  return true;
}
