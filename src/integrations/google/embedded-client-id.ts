/**
 * OAuth client ID bundled with the app. The maintainer registers ONE Google
 * Cloud OAuth client for the whole app (PKCE public client — the ID is
 * public by design, no secret), so every user connects out of the box with
 * zero setup: Settings → Connect.
 *
 * Empty until the maintainer creates it — see docs/google-oauth-setup.md.
 * Users can still enter their own client ID in Settings (override).
 */
export const EMBEDDED_CLIENT_ID = '';
