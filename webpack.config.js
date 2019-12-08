const glob = require("glob");

const outputSrc = `${__dirname}/build/src`;
const outputTests = `${__dirname}/build/tests`;

const srcConfig = {
    name: 'src',
    entry: {
        'cpu-debugger-ui': './src/cpu-debugger-ui.ts',
        'emulator-debugger': './src/emulator-debugger/emulator-debugger.ts'
    },
    resolve: {
        extensions: ['.ts']
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [{loader: 'ts-loader'}]
            },
            {
                enforce: "pre",
                test: /\.js$/,
                loader: "source-map-loader"
            }
        ]
    },
    devtool: 'source-map',
    mode: 'development',
    output: {
        path: outputSrc,
        filename: '[name].js'
    }
};

const testsConfig = {
    ...srcConfig,
    name: 'tests',
    target: 'node',
    node: {
        fs: "empty"
    },
    entry: {
        'bundle.test': glob.sync('./tests/*.test.ts')
    },
    devtool: false,
    output: {
        path: outputTests,
        filename: '[name].js'
    }
};

module.exports = [srcConfig, testsConfig];
