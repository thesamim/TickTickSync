# Login

## Choosing Your Server

Before logging in, select your home server from the **Access Control** section in settings:

- **TickTick** — `https://ticktick.com`
- **Dida** — `https://dida365.com`

Changing servers after login requires re-authentication.

## Login Methods

Two login methods are available depending on your account setup:

### SSO / 2FA Login (Web-based)

Use this if your TickTick/Dida account uses **SSO** (e.g., login with Google, Apple, or email without a password) or **Two-Factor Authentication**.

!!! tip "Desktop only"
    Web-based login is only available on **desktop**. For mobile, see [Mobile Login](#mobile-login) below.

1. Click the **Login with {provider}** button in settings
2. A browser window will open to authenticate with your provider
3. Complete the sign-in process in the browser
4. Click **Finish**. The browser window will close and the plugin will detect the login automatically

!!! note
    The plugin does **not** save your user ID or password. Authentication is handled through secure tokens.

### Regular Login (Username/Password)

Use this if your account is set up with a username and password.

1. Enter your **Username** in the settings field
2. Enter your **Password** in the settings field
3. Click the **Login** button

### Mobile Login

Mobile only supports **Regular Login** with username and password.

If your account uses SSO/2FA:

1. Log in on **desktop** first using Web-based login
2. Synchronize your vault
3. Transfer the vault to your mobile device
4. You will remain logged in on mobile

## Verifying Login

After a successful login, the settings will display **"You are logged in."** You can re-login at any time if needed.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Login button is unresponsive | Ensure you've selected the correct home server |
| Browser window opens but login fails | Try clearing browser cookies or using a different default browser |
| "Login failed" error | Check your credentials and server selection; try Regular Login instead |
| Can't login on mobile with SSO | Login on desktop first, then sync your vault to mobile |
