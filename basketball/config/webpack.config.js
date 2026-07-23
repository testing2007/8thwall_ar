const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')

const createDev8Plugin = require('./dev8-plugin')

const rootPath = process.cwd()
const distPath = path.join(rootPath, 'dist')
const srcPath = path.join(rootPath, 'src')

const makeTsLoader = () => ({
  test: /\.ts$/,
  loader: 'ts-loader',
  exclude: /node_modules/,
})

const makeAssetLoader = () => ({
  test: /\..*$/,
  include: [path.join(srcPath, 'assets')],
  loader: path.join(__dirname, 'asset-loader.js'),
})

const config = {
  entry: './app.js',
  output: {
    filename: 'bundle.js',
    path: distPath,
    publicPath: '/',
    clean: true,
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.join(srcPath, 'index.html'),
      filename: 'index.html',
      scriptLoading: 'blocking',
      inject: false,
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.join(srcPath, 'assets/models'),
          to: path.join(distPath, 'assets/models'),
          noErrorOnMissing: true,
        },
        {
          from: path.join(srcPath, 'assets/onboarding'),
          to: path.join(distPath, 'assets/onboarding'),
          noErrorOnMissing: true,
        },
        {
          from: path.join(srcPath, 'assets/textures'),
          to: path.join(distPath, 'assets/textures'),
          noErrorOnMissing: true,
        },
        {
          from: path.join(srcPath, 'assets/videos'),
          to: path.join(distPath, 'assets/videos'),
          noErrorOnMissing: true,
        },
        {
          from: path.join(srcPath, 'index.css'),
          to: path.join(distPath, 'index.css'),
          noErrorOnMissing: true,
        },
      ],
    }),
  ],
  resolve: {extensions: ['.ts', '.js']},
  module: {
    rules: [
      makeTsLoader(),
      makeAssetLoader(),
    ],
  },
  mode: 'production',
  context: srcPath,
  externals: {
    '@8thwall/ecs': 'window.ecs',
  },
  devServer: {
    open: false,
    compress: true,
    hot: true,
    liveReload: false,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
    },
    client: {
      webSocketURL: 'ws://0.0.0.0/ws',
      overlay: {
        warnings: false,
        errors: true,
      },
    },
  },
}

module.exports = (_, argv) => {
  if (argv.mode === 'development') {
    return {
      ...config,
      plugins: [
        ...config.plugins,
        createDev8Plugin({src: './external/dev8/dev8.js'}),
        new CopyWebpackPlugin({
          patterns: [{
            from: path.join(rootPath, 'node_modules/@8thwall/ecs/dev8'),
            to: path.join(distPath, 'external/dev8'),
            noErrorOnMissing: true,
          }],
        }),
      ],
    }
  }

  return config
}
