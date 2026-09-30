import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Wallet } from 'ethers'
import { EthereumSigner } from '@dha-team/arbundles'
import {
  AoClient,
  AoContractError,
  createAoClient,
  nodeUrlFromEnv
} from '@anyone-protocol/ao-client'

import { OperatorRegistryState } from './interfaces/operator-registry'
import { RelayDataDto } from 'src/validation/dto/relay-data-dto'

@Injectable()
export class OperatorRegistryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OperatorRegistryService.name)

  private readonly operatorRegistryProcessId: string
  private readonly operatorRegistryControllerKey: string
  private readonly hbUrl: string

  private ao!: AoClient

  constructor(
    readonly config: ConfigService<{
      OPERATOR_REGISTRY_CONTROLLER_KEY: string
      OPERATOR_REGISTRY_PROCESS_ID: string
      HB_URL: string
      IS_LIVE: string
    }>
  ) {
    this.operatorRegistryProcessId = config.get<string>(
      'OPERATOR_REGISTRY_PROCESS_ID',
      { infer: true }
    )
    if (!this.operatorRegistryProcessId) {
      throw new Error('OPERATOR_REGISTRY_PROCESS_ID is not set!')
    }

    this.operatorRegistryControllerKey = config.get<string>(
      'OPERATOR_REGISTRY_CONTROLLER_KEY',
      { infer: true }
    )
    if (!this.operatorRegistryControllerKey) {
      throw new Error('OPERATOR_REGISTRY_CONTROLLER_KEY is not set!')
    }

    // Fail closed, with no default. This replaces CU_URL/GATEWAY_URL/GRAPHQL_URL,
    // two of which pointed at a third party (ar-io.net). The legacynet outage that
    // forced this migration was caused by exactly that kind of silent external
    // endpoint, so there must never be a fallback here.
    this.hbUrl = nodeUrlFromEnv({
      HB_URL: config.get<string>('HB_URL', { infer: true })
    })
  }

  async onApplicationBootstrap() {
    this.ao = createAoClient({
      url: this.hbUrl,
      signer: new EthereumSigner(this.operatorRegistryControllerKey),
      logger: {
        debug: (m, ...meta) => this.logger.debug(m, ...meta),
        warn: (m, ...meta) => this.logger.warn(m, ...meta),
        error: (m, ...meta) => this.logger.error(m, ...meta)
      }
    })

    const address = await new Wallet(
      this.operatorRegistryControllerKey
    ).getAddress()
    this.logger.log(
      `Bootstrapped with signer address ${address} against node ${this.hbUrl}`
    )

    // Surface an unreachable or misconfigured node at boot rather than on the first
    // scheduled task. Warn rather than throw: a node blip during a rolling deploy
    // should not put this service into a crash loop.
    try {
      this.logger.log(`Node operator address: ${await this.ao.fetchNodeAddress()}`)
    } catch (error) {
      this.logger.warn(
        `Could not reach the HyperBEAM node at ${this.hbUrl} during bootstrap`,
        error.stack
      )
    }
  }

  /**
   * Whole-registry read, used for bulk membership tests in the verification flow.
   *
   * WHY `dump` AND NOT THE `fingerprints` VIEW — measured against a node holding the
   * real migrated registry (7932 verified / 2940 claimable / 1088 hardware):
   *
   *   - Read latency is dominated by materializing `now`, and scales with STATE size,
   *     not response size. Every read of this process costs ~2.7s whether it returns
   *     226 bytes or 1MB. (The same contract with empty state answers in ~30ms.)
   *   - The `fingerprints` view takes ids in the query string and returns HTTP 414
   *     somewhere between 100 and 200 ids (~8KB of URL), so a bulk check must be
   *     chunked at ~150.
   *
   * Together those make chunking far more expensive, not less: ~7000 fingerprints is
   * ~47 requests x 2.7s ~= 127s, against a single 2.9s `dump`. Use the `fingerprints`
   * view for small lookups (tens of ids); use this for the bulk sweep.
   */
  public async getOperatorRegistryState(): Promise<OperatorRegistryState> {
    const state = await this.ao.readView<OperatorRegistryState>(
      this.operatorRegistryProcessId,
      'dump'
    )

    // NB: Lua returns empty tables as JSON arrays, so we normalize them to empty
    //     objects as when they are populated they will also be objects. Still true
    //     of the native contract: a freshly seeded-empty process dumps
    //     {"claimable":[],"verified":[],...}.
    for (const prop in state) {
      if (Array.isArray(state[prop]) && state[prop].length < 1) {
        state[prop] = {} as any
      }
    }

    return state
  }

  public async addRegistrationCredit(
    address: string,
    transactionHash: string,
    fingerprint: string
  ): Promise<boolean> {
    if (!this.ao) {
      throw new Error('AO client is not defined!')
    }

    try {
      // Tag names must be lowercase for the ans104 signature round-trip; the node
      // presents them to the contract title-cased (`ctx.tags['Address']`).
      const { id } = await this.ao.sendMessage({
        processId: this.operatorRegistryProcessId,
        action: 'Add-Registration-Credit',
        tags: [
          { name: 'address', value: address },
          { name: 'fingerprint', value: fingerprint },
          { name: 'evm-tx', value: transactionHash }
        ]
      })

      this.logger.log(
        `Added registration credit to [${address}|${fingerprint}]: ${id}`
      )

      return true
    } catch (error) {
      // A contract rejection is a business outcome (e.g. the credit already
      // exists), not an outage — log it as such. Note this is now actually
      // detected: a rejected write still returns HTTP 200, and ao-client confirms
      // the message's own slot output rather than trusting the status code.
      if (error instanceof AoContractError) {
        this.logger.warn(
          `Add-Registration-Credit was rejected by the contract for ` +
            `[${JSON.stringify({ address, transactionHash, fingerprint })}]: ` +
            error.reason
        )
      } else {
        this.logger.error(
          `Exception when adding registration credit` +
            ` [${JSON.stringify({ address, transactionHash, fingerprint })}]`,
          error.stack
        )
      }
    }

    return false
  }

  public async adminSubmitOperatorCertificates(
    relays: { relay: RelayDataDto; isHardwareProofValid?: boolean }[]
  ): Promise<{ success: boolean; messageId?: string }> {
    if (!this.ao) {
      throw new Error('AO client is not defined!')
    }

    let messageId: string | undefined

    try {
      const data = JSON.stringify(
        relays.map(({ relay, isHardwareProofValid }) =>
          isHardwareProofValid
            ? { a: relay.any1_address, f: relay.fingerprint, hw: true }
            : { a: relay.any1_address, f: relay.fingerprint }
        )
      )
      this.logger.log(
        `Admin-Submit-Operator-Certificates for ${relays.length} relays ` +
          `to process [${this.operatorRegistryProcessId}] with data [${data}]`
      )

      const sent = await this.ao.sendMessage({
        processId: this.operatorRegistryProcessId,
        action: 'Admin-Submit-Operator-Certificates',
        data
      })
      messageId = sent.id

      this.logger.log(
        `Success Admin-Submit-Operator-Certificates for ${relays.length}` +
          ` relays: ${messageId}`
      )

      return { success: true, messageId }
    } catch (error) {
      if (error instanceof AoContractError) {
        this.logger.warn(
          `Admin-Submit-Operator-Certificates was rejected by the contract for ` +
            `${relays.length} relays [slot ${error.slot}]: ${error.reason}`
        )
      } else {
        this.logger.error(
          `Exception when calling Admin-Submit-Operator-Certificates`,
          error.stack
        )
      }
    }

    return { success: false }
  }
}
