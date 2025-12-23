# CurseForge API Key Setup

ModEx requires a CurseForge API key to access mod information, check updates, and browse the CurseForge catalog.

## Why is an API Key Required?

CurseForge's API requires authentication to:
- Fetch mod details and download links
- Search the mod catalog
- Check for mod updates
- Retrieve dependency information

The API key is **free** and easy to obtain.

## Getting Your API Key

### Step 1: Create a CurseForge Account

If you don't have one already:
1. Go to [curseforge.com](https://www.curseforge.com/)
2. Click **Sign Up**
3. Create your account

### Step 2: Access the Developer Console

1. Go to [console.curseforge.com](https://console.curseforge.com/)
2. Sign in with your CurseForge account
3. Accept the API Terms of Service if prompted

### Step 3: Create an API Key

1. In the console, go to **API Keys**
2. Click **Create API Key**
3. Give it a name (e.g., "ModEx")
4. Copy the generated key

::: warning Keep Your Key Private
Your API key is personal. Don't share it publicly or commit it to version control.
:::

## Configuring ModEx

### Adding Your API Key

1. Open ModEx
2. Go to **Settings** (sidebar gear icon)
3. Navigate to the **General** tab
4. Find the **API Configuration** section
5. Paste your API key in the field
6. Click **Save**

### Verifying the Connection

After saving:
- The status indicator should turn green
- Try searching for a mod in the Library to confirm it works

## Troubleshooting

### "API Key Invalid" Error

- Double-check that you copied the entire key
- Make sure there are no extra spaces before or after
- Try generating a new key in the CurseForge Console

### "Rate Limited" Error

CurseForge has rate limits. If you see this:
- Wait a few minutes before trying again
- Avoid rapid repeated searches

### "Network Error"

- Check your internet connection
- Verify that `api.curseforge.com` is accessible
- Check if a firewall is blocking the connection
