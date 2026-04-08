import { createRequire } from "module";
const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,

    webpack: (config) => {
        // MetaMask SDK pulls in React Native's async-storage which doesn't
        // exist in a browser/Node build. Alias it to our no-op stub.
        config.resolve.alias = {
            ...config.resolve.alias,
            "@react-native-async-storage/async-storage":
                require.resolve("./src/mocks/async-storage-mock.cjs"),
        };

        // pino-pretty + lokijs + encoding are optional deps used only in
        // React Native / CLI environments. Mark them external so webpack
        // skips bundling them entirely.
        config.externals = [
            ...(config.externals ?? []),
            "pino-pretty",
            "lokijs",
            "encoding",
        ];

        return config;
    },
};

export default nextConfig;
