const output = `${__dirname}/build`;

module.exports = {
    entry: {
        'cpu-debugger': './src/cpu-debugger.ts'
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
        path: output,
        filename: '[name].js'
    }
}
