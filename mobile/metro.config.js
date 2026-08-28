const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

const config = getDefaultConfig(__dirname)

// Máquina compartilhada com Docker/WSL: o default (nº de CPUs) abre ~11 workers
// e estoura a RAM no bundle de release. 4 é o equilíbrio — pouco mais lento,
// muito mais leve.
config.maxWorkers = 4

module.exports = withNativeWind(config, { input: './global.css' })
