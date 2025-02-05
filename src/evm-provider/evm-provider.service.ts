import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ethers } from 'ethers'

import { createResilientProviders } from '../util/resilient-websocket-provider'

const DefaultEvmProviderServiceConfig = {
  EVM_NETWORK: '',
  EVM_PRIMARY_WSS: '',
  EVM_SECONDARY_WSS: '',
  EVM_MAINNET_PRIMARY_WSS: '',
  EVM_MAINNET_SECONDARY_WSS: '',
  EVM_MAINNET_PRIMARY_JSON_RPC: '',
  EVM_MAINNET_SECONDARY_JSON_RPC: ''
}
const DESTROY_WEBSOCKET_INTERVAL = 5

@Injectable()
export class EvmProviderService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(EvmProviderService.name)

  public readonly config: typeof DefaultEvmProviderServiceConfig =
    DefaultEvmProviderServiceConfig

  private primaryWebSocketProvider!: ethers.WebSocketProvider
  private secondaryWebSocketProvider!: ethers.WebSocketProvider
  private currentWebSocketProvider!: ethers.WebSocketProvider
  private currentWebSocketName: 'primary (infura)' | 'secondary (alchemy)' =
    'primary (infura)'

  private primaryMainnetWebSocketProvider!: ethers.WebSocketProvider
  private secondaryMainnetWebSocketProvider!: ethers.WebSocketProvider
  private currentMainnetWebSocketProvider!: ethers.WebSocketProvider
  private currentMainnetWebSocketName:
    'primary (mainnet infura)' | 'secondary (mainnet alchemy)' =
      'primary (mainnet infura)'

  private primaryMainnetJsonRpcProvider!: ethers.JsonRpcProvider
  private secondaryMainnetJsonRpcProvider!: ethers.JsonRpcProvider

  private providerSwapCallbacks: (
    (provider: ethers.WebSocketProvider) => void
  )[] = []
  private providerMainnetSwapCallbacks: (
    (provider: ethers.WebSocketProvider) => void
  )[] = []

  constructor(config: ConfigService<typeof DefaultEvmProviderServiceConfig>) {
    this.config.EVM_NETWORK = config.get<string>('EVM_NETWORK', { infer: true })
    if (!this.config.EVM_NETWORK) {
      throw new Error('EVM_NETWORK is not set!')
    }
    this.config.EVM_MAINNET_PRIMARY_JSON_RPC = config.get<string>(
      'EVM_MAINNET_PRIMARY_JSON_RPC',
      { infer: true }
    )
    this.config.EVM_MAINNET_SECONDARY_JSON_RPC = config.get<string>(
      'EVM_MAINNET_SECONDARY_JSON_RPC',
      { infer: true }
    )
    // this.config.EVM_PRIMARY_WSS = config.get<string>(
    //   'EVM_PRIMARY_WSS',
    //   { infer: true }
    // )
    // if (!this.config.EVM_PRIMARY_WSS) {
    //   throw new Error('EVM_PRIMARY_WSS is not set!')
    // }
    // this.config.EVM_SECONDARY_WSS = config.get<string>(
    //   'EVM_SECONDARY_WSS',
    //   { infer: true }
    // )
    // if (!this.config.EVM_SECONDARY_WSS) {
    //   throw new Error('EVM_SECONDARY_WSS is not set!')
    // }
    // this.config.EVM_MAINNET_PRIMARY_WSS = config.get<string>(
    //   'EVM_MAINNET_PRIMARY_WSS',
    //   { infer: true }
    // )
    // if (!this.config.EVM_MAINNET_PRIMARY_WSS) {
    //   throw new Error('EVM_MAINNET_PRIMARY_WSS is not set!')
    // }
    // this.config.EVM_MAINNET_SECONDARY_WSS = config.get<string>(
    //   'EVM_MAINNET_SECONDARY_WSS',
    //   { infer: true }
    // )
    // if (!this.config.EVM_MAINNET_SECONDARY_WSS) {
    //   throw new Error('EVM_MAINNET_SECONDARY_WSS is not set!')
    // }
  }

  onApplicationShutdown() {
    // const waitForWebsocketAndDestroy = (provider: ethers.WebSocketProvider) => {
    //   setTimeout(() => {
    //     if (provider.websocket.readyState) {
    //       provider.destroy()
    //     } else {
    //       waitForWebsocketAndDestroy(provider)
    //     }
    //   }, DESTROY_WEBSOCKET_INTERVAL)
    // }

    // waitForWebsocketAndDestroy(this.primaryWebSocketProvider)
    // waitForWebsocketAndDestroy(this.secondaryWebSocketProvider)
    // waitForWebsocketAndDestroy(this.primaryMainnetWebSocketProvider)
    // waitForWebsocketAndDestroy(this.secondaryMainnetWebSocketProvider)
  }

  async onApplicationBootstrap() {
    // const [primaryProvider] = await createResilientProviders(
    //   [{ url: this.config.EVM_PRIMARY_WSS, name: 'primary (infura)' }],
    //   this.config.EVM_NETWORK,
    //   this.swapProviders.bind(this)
    // )
    // this.primaryWebSocketProvider = primaryProvider
    // const [secondaryProvider] = await createResilientProviders(
    //   [{ url: this.config.EVM_SECONDARY_WSS, name: 'secondary (alchemy)' }],
    //   this.config.EVM_NETWORK,
    //   this.swapProviders.bind(this)
    // )
    // this.secondaryWebSocketProvider = secondaryProvider
    // this.currentWebSocketProvider = this.primaryWebSocketProvider

    // const [primaryMainnetProvider] = await createResilientProviders(
    //   [{
    //     url: this.config.EVM_MAINNET_PRIMARY_WSS,
    //     name: 'primary (mainnet infura)'
    //   }],
    //   0x1, // NB: Mainnet chain id
    //   this.swapProviders.bind(this)
    // )
    // this.primaryMainnetWebSocketProvider = primaryMainnetProvider
    // const [secondaryMainnetProvider] = await createResilientProviders(
    //   [{
    //     url: this.config.EVM_MAINNET_SECONDARY_WSS,
    //     name: 'secondary (mainnet alchemy)'
    //   }],
    //   0x1, // NB: Mainnet chain id
    //   this.swapProviders.bind(this)
    // )
    // this.secondaryWebSocketProvider = secondaryMainnetProvider
    // this.currentMainnetWebSocketProvider = this.primaryMainnetWebSocketProvider

    this.primaryMainnetJsonRpcProvider = new ethers.JsonRpcProvider(
      this.config.EVM_MAINNET_PRIMARY_JSON_RPC,
      0x1 // NB: Mainnet chain id
    )
    this.secondaryMainnetJsonRpcProvider = new ethers.JsonRpcProvider(
      this.config.EVM_MAINNET_SECONDARY_JSON_RPC,
      0x1 // NB: Mainnet chain id
    )
  }

  private swapProviders(
    name:
      | typeof this.currentWebSocketName
      | typeof this.currentMainnetWebSocketName
  ) {
    switch (name) {
      case 'primary (infura)':
        this.currentWebSocketName = 'secondary (alchemy)'
        this.currentWebSocketProvider = this.secondaryWebSocketProvider
        break
      case 'secondary (alchemy)':
        this.currentWebSocketName = 'primary (infura)'
        this.currentWebSocketProvider = this.primaryWebSocketProvider
        break
      case 'primary (mainnet infura)':
        this.currentMainnetWebSocketName = 'secondary (mainnet alchemy)'
        this.currentMainnetWebSocketProvider = this.secondaryMainnetWebSocketProvider
        break
      case 'secondary (mainnet alchemy)':
        this.currentMainnetWebSocketName = 'primary (mainnet infura)'
        this.currentMainnetWebSocketProvider = this.primaryMainnetWebSocketProvider
        break
    }

    if (name === 'primary (infura)' || name === 'secondary (alchemy)') {
      for (const providerSwapCallback of this.providerSwapCallbacks) {
        providerSwapCallback(this.currentWebSocketProvider)
      }
    }

    if (name === 'primary (mainnet infura)' || name === 'secondary (mainnet alchemy)') {
      for (const providerSwapCallback of this.providerMainnetSwapCallbacks) {
        providerSwapCallback(this.currentMainnetWebSocketProvider)
      }
    }

    this.logger.log(`Swapped provider to ${this.currentWebSocketName}`)
  }

  private async waitOnBootstrap() {
    // this.logger.log('Waiting for service to bootstrap')
    // return new Promise<void>((resolve) => {
    //   const checkReadyAndResolve = () => {
    //     if (
    //       this.currentWebSocketProvider &&
    //       this.currentWebSocketProvider.websocket &&
    //       this.currentWebSocketProvider.websocket.readyState &&
    //       this.currentMainnetWebSocketProvider &&
    //       this.currentMainnetWebSocketProvider.websocket &&
    //       this.currentMainnetWebSocketProvider.websocket.readyState
    //     ) {
    //       this.logger.log(`Service is bootstrapped and ready`)
    //       resolve()
    //     } else {
    //       setTimeout(checkReadyAndResolve, 100)
    //     }
    //   }

    //   checkReadyAndResolve()
    // })
  }

  async getCurrentWebSocketProvider(
    onSwapProvidersCallback: (provider: ethers.WebSocketProvider) => void
  ) {
    throw new Error('WebSocketProvider is disabled in this service')
    // await this.waitOnBootstrap()
    // this.providerSwapCallbacks.push(onSwapProvidersCallback)

    // return this.currentWebSocketProvider
  }

  async getCurrentMainnetWebSocketProvider(
    onSwapProvidersCallback: (provider: ethers.WebSocketProvider) => void
  ) {
    throw new Error('WebSocketProvider is disabled in this service')
    // await this.waitOnBootstrap()
    // this.providerMainnetSwapCallbacks.push(onSwapProvidersCallback)

    // return this.currentMainnetWebSocketProvider
  }

  async getCurrentMainnetJsonRpcProvider() {
    await this.waitOnBootstrap()
    return this.primaryMainnetJsonRpcProvider
  }

  async getBackupMainnetJsonRpcProvider() {
    await this.waitOnBootstrap()
    return this.secondaryMainnetJsonRpcProvider
  }
}
