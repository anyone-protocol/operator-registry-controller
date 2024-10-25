import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import _ from 'lodash'
import { Model } from 'mongoose'
import { Wallet } from 'ethers'

import { VerificationData } from './schemas/verification-data'
import { VerificationResults } from './dto/verification-result-dto'
import { ValidatedRelay } from '../validation/schemas/validated-relay'
import { RelayValidationStatsDto } from './dto/relay-validation-stats'
import { HardwareVerificationService } from './hardware-verification.service'
import { EthereumSigner } from '../util/arbundles-lite'
import { sendAosMessage } from '../util/send-aos-message'
import {
  createEthereumDataItemSigner
} from '../util/create-ethereum-data-item-signer'

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name)

  private isLive?: string

  private signer?: EthereumSigner
  private operatorRegistryProcessId?: string
  private bundler?: any

  constructor(
    config: ConfigService<{
      OPERATOR_REGISTRY_CONTROLLER_KEY: string
      OPERATOR_REGISTRY_PROCESS_ID: string
      IS_LIVE: string
    }>,
    @InjectModel(VerificationData.name)
    private readonly verificationDataModel: Model<VerificationData>,
    private readonly hardwareVerificationService: HardwareVerificationService
  ) {
    this.isLive = config.get<string>('IS_LIVE', { infer: true })
    this.logger.log(
      `Initializing VerificationService [IS_LIVE: ${this.isLive}]`
    )
    this.operatorRegistryProcessId = config.get<string>(
      'OPERATOR_REGISTRY_PROCESS_ID',
      { infer: true }
    )
    if (!this.operatorRegistryProcessId) {
      throw new Error('OPERATOR_REGISTRY_PROCESS_ID is not set!')
    }
    this.logger.log(
      `Using Operator Registry Process ID: ${this.operatorRegistryProcessId}`
    )
    const operatorRegistryControllerKey = config.get<string>(
      'OPERATOR_REGISTRY_CONTROLLER_KEY',
      { infer: true }
    )
    if (!operatorRegistryControllerKey) {
      throw new Error('OPERATOR_REGISTRY_CONTROLLER_KEY is not set!')
    }
    this.signer = new EthereumSigner(operatorRegistryControllerKey)
    this.logger.log(`Got Operator Registry Controller Key`)

    // if (relayRegistryOperatorKey !== undefined) {
    //   this.bundlr = (() => {
    //     const node = config.get<string>('IRYS_NODE', {
    //       infer: true
    //     })
    //     const network = config.get<string>('IRYS_NETWORK', {
    //       infer: true
    //     })

    //     if (node !== undefined && network !== undefined) {
    //       return new Bundlr(node, network, relayRegistryOperatorKey)
    //     } else {
    //       return undefined
    //     }
    //   })()

    //   if (this.bundlr !== undefined) {
    //     this.logger.log(
    //       `Initialized Bundlr for address: ${this.bundlr.address}`
    //     )
    //   } else {
    //     this.logger.error('Failed to initialize Bundlr!')
    //   }
    // } else this.logger.error('Missing contract owner key...')
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.signer !== undefined) {
      const address = await new Wallet(
        Buffer.from(this.signer.key).toString('hex')
      ).getAddress()
      this.logger.log(`Initialized with controller address: ${address}`)
    } else {
      this.logger.error('Operator is undefined!')
    }
  }

  async storeRelayHexMap(data: VerificationResults) {
    if (this.bundler !== undefined) {
      if (this.isLive === 'true') {
        try {
          const stamp = Date.now()

          const grouped = data.reduce(
            (curr, item) => {
              ;(curr[item.relay.primary_address_hex] ||= []).push(item)
              return curr
            },
            {} as Record<string, VerificationResults>
          )
          const filled = []
          for (const hex_id in grouped) {
            filled.push({
              h3cell: hex_id,
              claimable: grouped[hex_id].filter(
                (v) => v.result == 'OK' || v.result == 'AlreadyRegistered'
              ).length,
              verified: grouped[hex_id].filter(
                (v) => v.result == 'AlreadyVerified'
              ).length,
              running: grouped[hex_id].filter((v) => v.relay.running).length,
              running_verified: grouped[hex_id].filter(
                (v) => v.relay.running && v.result == 'AlreadyVerified'
              ).length
            })
          }

          const response = await this.bundler?.upload(JSON.stringify(filled), {
            tags: [
              { name: 'Protocol', value: 'ator' },
              { name: 'Protocol-Version', value: '0.1' },
              {
                name: 'Content-Timestamp',
                value: stamp.toString()
              },
              {
                name: 'Content-Type',
                value: 'application/json'
              },
              { name: 'Entity-Type', value: 'relay/hex-map' }
            ]
          })
          this.logger.log(
            `Permanently stored relay hex map ${stamp} with ${data.length} relay(s): ${response.id} `
          )
          return response.id
        } catch (error) {
          this.logger.warn(
            `Exception when storing relay hex map: ${error}`,
            error.stack
          )
        }
      } else {
        this.logger.warn(`NOT LIVE: Not storing relay hex map`)
        return 'not-live-skipped-store-relay-hex-map'
      }
    } else {
      this.logger.error('Bundler not initialized, not persisting relay hex map')
    }
    return ''
  }

  private async storeRelayMetrics(
    stamp: number,
    data: VerificationResults
  ): Promise<string> {
    if (this.bundler !== undefined) {
      if (this.isLive === 'true') {
        try {
          const response = await this.bundler?.upload(JSON.stringify(data), {
            tags: [
              { name: 'Protocol', value: 'ator' },
              { name: 'Protocol-Version', value: '0.1' },
              {
                name: 'Content-Timestamp',
                value: stamp.toString()
              },
              {
                name: 'Content-Type',
                value: 'application/json'
              },
              { name: 'Entity-Type', value: 'relay/metrics' }
            ]
          })
          this.logger.log(
            `Permanently stored relay/metrics ${stamp} with ${data.length} relay(s): ${response.id} `
          )
          return response.id
        } catch (e) {
          this.logger.warn(`Exception when storing relay metrics: ${e}`)
        }
      } else {
        this.logger.warn(
          `NOT LIVE: Not storing relay/metrics ${stamp} with ${data.length} relay(s) `
        )
        return 'not-live-skipped-store-relay-metrics'
      }
    } else {
      this.logger.error('Bundler not initialized, not persisting relay/metrics')
    }
    return ''
  }

  private async storeValidationStats(
    stamp: number,
    data: RelayValidationStatsDto
  ): Promise<string> {
    if (this.bundler !== undefined) {
      if (this.isLive === 'true') {
        try {
          const response = await this.bundler?.upload(JSON.stringify(data), {
            tags: [
              { name: 'Protocol', value: 'ator' },
              { name: 'Protocol-Version', value: '0.1' },
              {
                name: 'Content-Timestamp',
                value: stamp.toString()
              },
              {
                name: 'Content-Type',
                value: 'application/json'
              },
              {
                name: 'Entity-Type',
                value: 'validation/stats'
              }
            ]
          })

          this.logger.log(
            `Permanently stored validation/stats ${stamp}: ${response.id}`
          )

          return response.id
        } catch (e) {
          this.logger.warn(`Exception when storing validation stats: ${e}`)
        }
      } else {
        this.logger.warn(`NOT LIVE: Not storing validation/stats ${stamp}`)
        return 'not-live-skipped-store-validation-stats'
      }
    } else {
      this.logger.error(
        'Bundler not initialized, not persisting validation/stats'
      )
    }
    return ''
  }

  private getValidationStats(
    data: VerificationResults
  ): RelayValidationStatsDto {
    return data.reduce(
      (previous, current) => {
        return {
          consensus_weight:
            previous.consensus_weight + current.relay.consensus_weight,
          consensus_weight_fraction:
            previous.consensus_weight_fraction +
            current.relay.consensus_weight_fraction,
          observed_bandwidth:
            previous.observed_bandwidth + current.relay.observed_bandwidth,
          verification: {
            failed:
              previous.verification.failed +
              (current.result === 'Failed' ? 1 : 0),
            unclaimed:
              previous.verification.unclaimed +
              (current.result === 'OK' || current.result === 'AlreadyRegistered'
                ? 1
                : 0),
            verified:
              previous.verification.verified +
              (current.result === 'AlreadyVerified' ? 1 : 0),
            running:
              previous.verification.running + (current.relay.running ? 1 : 0)
          },
          verified_and_running: {
            consensus_weight:
              previous.verified_and_running.consensus_weight +
              (current.result === 'AlreadyVerified' && current.relay.running
                ? current.relay.consensus_weight
                : 0),
            consensus_weight_fraction:
              previous.verified_and_running.consensus_weight_fraction +
              (current.result === 'AlreadyVerified' && current.relay.running
                ? current.relay.consensus_weight_fraction
                : 0),
            observed_bandwidth:
              previous.verified_and_running.observed_bandwidth +
              (current.result === 'AlreadyVerified' && current.relay.running
                ? current.relay.observed_bandwidth
                : 0)
          }
        }
      },
      {
        consensus_weight: 0,
        consensus_weight_fraction: 0,
        observed_bandwidth: 0,
        verification: {
          failed: 0,
          unclaimed: 0,
          verified: 0,
          running: 0
        },
        verified_and_running: {
          consensus_weight: 0,
          consensus_weight_fraction: 0,
          observed_bandwidth: 0
        }
      }
    )
  }

  public async persistVerification(
    data: VerificationResults,
    metricsTx: string,
    statsTx: string
  ): Promise<VerificationData> {
    const verificationStamp = Date.now()
    const verifiedRelays = data.filter(({ result }) =>
      ['AlreadyRegistered', 'AlreadyVerified', 'OK'].includes(result)
    )

    const relayMetricsTx =
      metricsTx != ''
        ? metricsTx
        : await this.storeRelayMetrics(verificationStamp, verifiedRelays)

    let validationStatsTx = ''

    const validationStats: RelayValidationStatsDto =
      this.getValidationStats(data)

    validationStatsTx =
      statsTx != ''
        ? statsTx
        : await this.storeValidationStats(verificationStamp, validationStats)

    const verificationData: VerificationData = {
      verified_at: verificationStamp,
      relay_metrics_tx: relayMetricsTx,
      validation_stats_tx: validationStatsTx,
      relays: verifiedRelays
        .filter((value) => value.result == 'AlreadyVerified')
        .map((value) => value.relay)
    }

    await this.verificationDataModel
      .create<VerificationData>(verificationData)
      .catch((error) => this.logger.error(error))

    return verificationData
  }

  public async getMostRecent(): Promise<VerificationData | null> {
    return await this.verificationDataModel
      .findOne({})
      .sort({ verified_at: -1 })
      .exec()
      .catch((error) => {
        this.logger.error(error)
        return null
      })
  }

  public logVerification(data: VerificationResults) {
    const failed = data.filter((value) => value.result === 'Failed')
    if (failed.length > 0) {
      this.logger.warn(
        `Failed verification of ${failed.length} relay(s): [${failed
          .map((result) => result.relay.fingerprint)
          .join(', ')}]`
      )
    }

    const claimable = data.filter(
      (value) => value.result === 'AlreadyRegistered'
    )
    if (claimable.length > 0) {
      this.logger.log(
        `Skipped ${claimable.length} already registered/claimable relay(s)`
      )
    }

    const alreadyVerified = data.filter(
      (value) => value.result === 'AlreadyVerified'
    )
    if (alreadyVerified.length > 0) {
      this.logger.log(`Skipped ${alreadyVerified.length} verified relay(s)`)
    }

    const ok = data.filter((value) => value.result === 'OK')
    if (ok.length > 0) {
      this.logger.log(`Registered (for user claims) ${ok.length} relay(s)`)
    }

    const verifiedRelays = data.filter(
      (value) => value.result === 'AlreadyVerified'
    )

    this.logger.log(`Total verified relays: ${verifiedRelays.length}`)
  }

  private async getRelayRegistryStatuses(): Promise<{
    claimable: { [fingerprint in string]: string },
    verified: { [fingerprint in string]: string }
  }> {
    const { messageId, result } = await sendAosMessage({
      processId: this.operatorRegistryProcessId,
      signer: await createEthereumDataItemSigner(this.signer) as any,
      tags: [{ name: 'Action', value: 'TODO!!!!!!!!!!' }]
    })
    this.logger.debug(
      `getRelayRegistryStatuses() messageId: ${messageId}`
        + ` result: ${JSON.stringify(result)}`
    )    

    return { claimable: {}, verified: {} }

    // await this.refreshDreState()
    // if (this.dreState != undefined) {
    //   const { claimable, verified } = this.dreState

    //   return { claimable, verified }
    // } else {
    //   const {
    //     cachedValue: {
    //       state: { claimable, verified }
    //     }
    //   } = await this.relayRegistryContract.readState()

    //   return { claimable, verified }
    // }
  }

  public async verifyRelays(
    relays: ValidatedRelay[]
  ): Promise<VerificationResults> {
    const results: VerificationResults = []

    if (!this.operatorRegistryProcessId) {
      this.logger.error('Operator Registry Process ID is not defined!')

      return relays.map((relay) => ({ relay, result: 'Failed' }))
    }

    if (!this.signer) {
      this.logger.error('Relay registry operator not defined')

      return relays.map((relay) => ({ relay, result: 'Failed' }))
    }

    // NB: Filter out already claimed or verified relays
    const { claimable, verified } = await this.getRelayRegistryStatuses()
    const alreadyClaimableFingerprints = Object.keys(claimable)
    const alreadyVerifiedFingerprints = Object.keys(verified)
    const relaysToAddAsClaimable: {
      relay: ValidatedRelay
      isHardwareProofValid?: boolean
    }[] = []
    for (const relay of relays) {
      const isAlreadyClaimable = alreadyClaimableFingerprints.includes(
        relay.fingerprint
      )
      const isAlreadyVerified = alreadyVerifiedFingerprints.includes(
        relay.fingerprint
      )

      this.logger.debug(
        `${relay.fingerprint}|${relay.ator_address}`
          + ` IS_LIVE: ${this.isLive}`
          + ` Claimable: ${isAlreadyClaimable}`
          + ` Verified: ${isAlreadyVerified}`
      )

      if (relay.ator_address === '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF') {
        this.logger.log(
          `Failing relay ${relay.fingerprint}`
            + ` with dummy address ${relay.ator_address}`
        )
        results.push({ relay, result: 'Failed' })
      } else if (isAlreadyClaimable) {
        this.logger.debug(
          `Already registered (can be claimed) relay [${relay.fingerprint}]`
        )
        results.push({ relay, result: 'AlreadyRegistered' })
      } else if (isAlreadyVerified) {
        this.logger.debug(`Already verified relay [${relay.fingerprint}]`)
        results.push({ relay, result: 'AlreadyVerified' })
      } else if (!relay.hardware_info) {
        relaysToAddAsClaimable.push({ relay })
      } else {
        const isHardwareProofValid =
          await this.hardwareVerificationService.isHardwareProofValid(relay)
        if (isHardwareProofValid) {
          relay.hardware_validated = true
          relay.hardware_validated_at = Date.now()
          relaysToAddAsClaimable.push({ relay, isHardwareProofValid })
        } else {
          results.push({ relay, result: 'HardwareProofFailed' })
        }
      }
    }

    if (this.isLive === 'true') {
      try {
        throw new Error('This method needs to be re-implemented!')
        // if (relaysToAddAsClaimable.length > 0) {
        //   const relayBatches = _.chunk(
        //     relaysToAddAsClaimable,
        //     VerificationService.claimableRelaysPerBatch
        //   )

        //   for (const relayBatch of relayBatches) {
        //     await setTimeout(5000)
        //     this.logger.debug(
        //       `Starting to add a batch of claimable relays for ${relayBatch} relays [${relayBatch.map((r) => r.relay.fingerprint)}]`
        //     )
        //     const response =
        //       await this.relayRegistryContract.writeInteraction<AddClaimableBatched>(
        //         {
        //           function: 'addClaimableBatched',
        //           relays: relayBatch.map(
        //             ({
        //               relay: { fingerprint, ator_address, nickname },
        //               isHardwareProofValid
        //             }) => ({
        //               fingerprint,
        //               address: ator_address,
        //               nickname,
        //               hardwareVerified: isHardwareProofValid || undefined
        //             })
        //           )
        //         }
        //       )

        //     this.logger.log(
        //       `Added ${relayBatch.length} claimable relays: ${response?.originalTxId}`
        //     )
        //   }
        // }
      } catch (error) {
        this.logger.error(
          `Exception when verifying relays [${relaysToAddAsClaimable.length}]`,
          error.stack
        )

        return results.concat(
          relaysToAddAsClaimable.map(({ relay }) => ({
            relay,
            result: 'Failed'
          }))
        )
      }
    } else {
      this.logger.warn(
        `NOT LIVE - skipped contract call to add ${relaysToAddAsClaimable.length} claimable relays`
      )
    }

    return results.concat(
      relaysToAddAsClaimable.map(({ relay }) => ({ relay, result: 'OK' }))
    )
  }
}
