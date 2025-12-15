import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ethers } from 'ethers'

const DefaultEvmProviderServiceConfig = {
  EVM_MAINNET_PRIMARY_JSON_RPC: '',
  EVM_MAINNET_SECONDARY_JSON_RPC: ''
}

@Injectable()
export class EvmProviderService
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(EvmProviderService.name)

  public readonly config: typeof DefaultEvmProviderServiceConfig =
    DefaultEvmProviderServiceConfig

  private primaryMainnetJsonRpcProvider!: ethers.JsonRpcProvider
  private secondaryMainnetJsonRpcProvider!: ethers.JsonRpcProvider

  private providerSwapCallbacks: (
    (provider: ethers.WebSocketProvider) => void
  )[] = []
  private providerMainnetSwapCallbacks: (
    (provider: ethers.WebSocketProvider) => void
  )[] = []

  constructor(config: ConfigService<typeof DefaultEvmProviderServiceConfig>) {
    this.config.EVM_MAINNET_PRIMARY_JSON_RPC = config.get<string>(
      'EVM_MAINNET_PRIMARY_JSON_RPC',
      { infer: true }
    )
    if (!this.config.EVM_MAINNET_PRIMARY_JSON_RPC) {
      throw new Error('EVM_MAINNET_PRIMARY_JSON_RPC is not set!')
    }
    this.config.EVM_MAINNET_SECONDARY_JSON_RPC = config.get<string>(
      'EVM_MAINNET_SECONDARY_JSON_RPC',
      { infer: true }
    )
    if (!this.config.EVM_MAINNET_SECONDARY_JSON_RPC) {
      throw new Error('EVM_MAINNET_SECONDARY_JSON_RPC is not set!')
    }
  }

  async onApplicationBootstrap() {
    this.primaryMainnetJsonRpcProvider = new ethers.JsonRpcProvider(
      this.config.EVM_MAINNET_PRIMARY_JSON_RPC,
      0x1 // NB: Mainnet chain id
    )
    this.secondaryMainnetJsonRpcProvider = new ethers.JsonRpcProvider(
      this.config.EVM_MAINNET_SECONDARY_JSON_RPC,
      0x1 // NB: Mainnet chain id
    )
  }

  async getCurrentMainnetJsonRpcProvider() {
    return this.primaryMainnetJsonRpcProvider
  }

  async getBackupMainnetJsonRpcProvider() {
    return this.secondaryMainnetJsonRpcProvider
  }
}
