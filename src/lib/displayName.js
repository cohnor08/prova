// The name to show for a user everywhere (leaderboards, rosters, chats…).
// Prefer the username they set themselves; fall back to the email's local part,
// never the full email address.
export function displayName(user) {
  if (!user) return 'Someone';
  if (user.username && user.username.trim()) return user.username.trim();
  if (user.name && user.name.trim()) return user.name.trim();
  if (user.email) return user.email.split('@')[0];
  return 'Someone';
}
