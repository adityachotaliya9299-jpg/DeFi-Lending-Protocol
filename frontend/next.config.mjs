/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,

    webpack: (config) => {
        // MetaMask SDK imports React Native's async-storage in browser builds.
        // Setting alias to `false` tells webpack to return an empty module — no
        // file needed, no network request, no error.
        config.resolve.alias = {
            ...config.resolve.alias,
            "@react-native-async-storage/async-storage": false,
        };

        // pino-pretty / lokijs / encoding are optional CLI-only deps pulled in
        // by WalletConnect. Marking them external skips bundling entirely.
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