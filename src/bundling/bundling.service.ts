import Bundlr from '@bundlr-network/client'
import { NodeBundlr } from '@bundlr-network/client/build/cjs/node'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class BundlingService {
  private readonly logger = new Logger(BundlingService.name)

  private readonly bundler: NodeBundlr

  constructor(
    readonly config: ConfigService<{
      BUNDLER_CONTROLLER_KEY: string
      BUNDLER_NODE: string
      BUNDLER_NETWORK: string
    }>
  ) {
    this.logger.log('Initializing bundling service')

    const bundlerControllerKey = config.get<string>(
      'BUNDLER_CONTROLLER_KEY',
      { infer: true }
    )
    if (!bundlerControllerKey) {
      throw new Error('BUNDLER_CONTROLLER_KEY is not set!')
    }

    const bundlerNode = config.get<string>('BUNDLER_NODE', { infer: true })
    if (!bundlerNode) {
      throw new Error('BUNDLER_NODE is not set!')
    }

    const bundlerNetwork = config.get<string>(
      'BUNDLER_NETWORK',
      { infer: true }
    )
    if (!bundlerNetwork) {
      throw new Error('BUNDLER_NETWORK is not set!')
    }

    this.bundler = new Bundlr(bundlerNode, bundlerNetwork, bundlerControllerKey)
    const bundlerControllerAddress = this.bundler.address
    this.logger.log(
      `Initialized bundling service` +
        ` [${bundlerNode}, ${bundlerNetwork}, ${bundlerControllerAddress}]`
    )
  }

  async upload(
    data: string | Buffer,
    opts: { 
      tags?: {
        name: string
        value: string
      }[]
    }
  ) {
    return await this.bundler.upload(data, opts)
  }
}