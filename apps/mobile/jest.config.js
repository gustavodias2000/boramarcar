module.exports = {
  preset: "react-native",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testMatch: ["<rootDir>/src/v1/**/*.test.ts", "<rootDir>/src/v1/**/*.test.tsx", "<rootDir>/src/bora/**/*.test.ts", "<rootDir>/src/bora/**/*.test.tsx"],
  transformIgnorePatterns: ["node_modules/(?!(react-native|@react-native|@boramarca/core)/)"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
};
