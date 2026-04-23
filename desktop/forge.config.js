const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

const hasAppleNotarizeCredentials = Boolean(
  process.env.APPLE_ID &&
  process.env.APPLE_APP_SPECIFIC_PASSWORD &&
  process.env.APPLE_TEAM_ID
);

module.exports = {
  packagerConfig: {
    asar: true,
    executableName: 'terminal-littlebaby',
    appBundleId: 'cn.example.terminal-littlebaby',
    appCategoryType: 'public.app-category.finance',
    name: 'terminal-littlebaby',
    osxSign: hasAppleNotarizeCredentials ? true : undefined,
    osxNotarize: hasAppleNotarizeCredentials
      ? {
          appleId: process.env.APPLE_ID,
          appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
          teamId: process.env.APPLE_TEAM_ID
        }
      : undefined
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin']
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        format: 'ULFO'
      }
    }
  ],
  publishers: [
    {
      name: '@electron-forge/publisher-github',
      config: {
        repository: {
          owner: 'your-org',
          name: 'terminal-littlebaby'
        },
        prerelease: false,
        draft: false
      }
    }
  ],
  plugins: [
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true
    })
  ]
};
