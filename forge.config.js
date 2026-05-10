const path = require('path');

module.exports = {
  packagerConfig: {
    name: 'Aerview',
    executableName: 'Aerview',
    extraResource: [
      path.join(__dirname, 'python-embed'),
      path.join(__dirname, 'backend-bundle'),
    ],
    ignore: [
      /^\/src/,
      /^\/public/,
      /^\/backend$/,
      /^\/backend\//,
      /^\/backend-bundle$/,
      /^\/backend-bundle\//,
      /^\/backend-dist/,
      /^\/python-embed$/,
      /^\/python-embed\//,
      /^\/out/,
      /^\/release/,
      /^\/build/,
      /^\/dist/,
      /^\/\.venv/,
      /^\/\.git/,
      /^\/node_modules\/.cache/,
      /\.spec$/,
      /setup_freeze\.py/,
    ],
    win32metadata: {
      CompanyName: 'Aerview',
      FileDescription: 'Aerview — Action Recognition',
      ProductName: 'Aerview',
    },
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'Aerview',
        setupExe: 'AerviewSetup.exe',
        authors: 'Aerview',
        description: 'Action Recognition Application',
      },
    },
  ],
};