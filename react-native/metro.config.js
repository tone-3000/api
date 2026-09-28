const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// modules/t3k-preview/ios/native links to the repo's C++ engine; there's
// nothing for Metro to bundle in there.
config.resolver.blockList = [/modules\/[^/]+\/ios\/native\/.*/];

module.exports = config;
