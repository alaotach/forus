// Metro configuration for Expo
//
// Firebase Auth's React Native build mixes CJS requires of `@firebase/*` with
// ESM default exports from `firebase/*` when Metro resolves package "exports".
// That can lead to multiple module instances and runtime errors like:
//   "Component auth has not been registered yet"
// Disabling package exports forces Metro to fall back to the package's main
// entrypoints (CJS), keeping Firebase modules on a single instance.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = false;

module.exports = config;
