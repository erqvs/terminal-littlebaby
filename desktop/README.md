# terminal-littlebaby desktop

Electron desktop shell for the hosted `terminal-littlebaby` web app.

## What it does

- Loads the hosted app at `https://terminal-littlebaby.example.com:23333`
- Packages as a macOS desktop app
- Uses `update-electron-app` to check for updates from GitHub Releases

## Local development

```bash
cd desktop
npm install
npm start
```

To point the shell at a different environment:

```bash
TERMINAL_LITTLEBABY_APP_URL=http://localhost:5173 npm start
```

## Packaging

```bash
cd desktop
npm run package
```

## Publishing

`npm run publish` uses Electron Forge's GitHub publisher and uploads artifacts to the `your-org/terminal-littlebaby` releases page.

The repository is public, so packaged apps can use `update.electronjs.org` through `update-electron-app`.

Create a git tag that matches the desktop package version:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## macOS auto-update note

Electron's macOS auto-update flow expects signed builds. The current scaffold sets up the update client and GitHub release flow first. Before relying on production auto-update on macOS, add signing and notarization in your release workflow.
