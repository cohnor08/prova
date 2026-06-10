# Maintenance Mode Setup

## Firebase Firestore Configuration

The app checks a maintenance config document in Firestore on startup. To enable/disable maintenance mode:

### 1. Create the Firestore Document

Navigate to Firestore Console → `config` collection → create document `maintenance` with:

```json
{
  "enabled": false,
  "message": "This site is under maintenance."
}
```

### 2. Enable Maintenance Mode

In Firestore Console, update the `config/maintenance` document:

```json
{
  "enabled": true,
  "message": "We're performing scheduled maintenance. Please try again in a few minutes."
}
```

When `enabled: true`, all users see a full-screen maintenance message immediately on app startup.

### 3. Disable Maintenance Mode

Update the document:

```json
{
  "enabled": false,
  "message": "This site is under maintenance."
}
```

Users can resume normal app access.

## How It Works

- The `useMaintenance()` hook runs in App.js and listens for real-time Firestore changes
- On app startup, if `config/maintenance` doc has `enabled: true`, the app displays the maintenance message
- No navigation is available during maintenance — the app is completely blocked
- Works even if user is already logged in or on-boarded
- Message is customizable per deployment
