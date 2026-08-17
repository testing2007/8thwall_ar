const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')

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
  entry: path.join(srcPath, 'app.js'),
  output: {
    filename: 'bundle.js',
    chunkFilename: 'chunks/[name].[contenthash:8].js',
    path: distPath,
    publicPath: 'auto',
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
          from: path.join(rootPath, 'external', 'xr'),
          to: path.join(distPath, 'external', 'xr'),
          noErrorOnMissing: true,
        },
        {
          from: path.join(rootPath, 'external', 'xrextras'),
          to: path.join(distPath, 'external', 'xrextras'),
          noErrorOnMissing: true,
        },
        {
          from: path.join(rootPath, 'external', 'xrextras-shared-resources'),
          to: path.join(distPath, 'external', 'xrextras-shared-resources'),
          noErrorOnMissing: true,
        },
        {
          from: path.join(rootPath, 'external', 'landing-page'),
          to: path.join(distPath, 'external', 'landing-page'),
          noErrorOnMissing: true,
        },
        {
          from: path.join(srcPath, 'assets'),
          to: path.join(distPath, 'assets'),
          noErrorOnMissing: true,
          globOptions: {
            ignore: [
              '**/*.psd',
              '**/poster.png',
              '**/young-santa.jpg',
              '**/adult-santa.jpg',
              '**/grandpa-santa.jpg',
              '**/young-santa.png',
              '**/adult-santa.png',
              '**/grandpa-santa.png',
            ],
          },
        },
        {
          from: path.join(rootPath, 'image-targets'),
          to: path.join(distPath, 'image-targets'),
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

module.exports = () => config
