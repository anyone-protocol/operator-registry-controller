import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import _ from 'lodash'

import { VerificationData } from './schemas/verification-data'
import { VerificationResults } from './dto/verification-result-dto'
import { RelayValidationStatsDto } from './dto/relay-validation-stats'
import { HardwareVerificationService } from './hardware-verification.service'
import { ValidatedRelay } from '../validation/schemas/validated-relay'
import {
  OperatorRegistryService
} from '../operator-registry/operator-registry.service'
import { BundlingService } from '../bundling/bundling.service'

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name)

  private isLive?: string

  constructor(
    readonly config: ConfigService<{
      IS_LIVE: string
    }>,
    @InjectModel(VerificationData.name)
    private readonly verificationDataModel: Model<VerificationData>,
    private readonly hardwareVerificationService: HardwareVerificationService,
    private readonly operatorRegistryService: OperatorRegistryService,
    private readonly bundlingService: BundlingService
  ) {
    this.isLive = config.get<string>('IS_LIVE', { infer: true })

    this.logger.log(
      `Initializing verification service (IS_LIVE: ${this.isLive})`
    )
  }

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('Initialized')
  }

  async storeRelayHexMap(data: VerificationResults) {
    if (this.isLive !== 'true') {
      this.logger.warn(`NOT LIVE: Not storing relay hex map`)

      return 'not-live-skipped-store-relay-hex-map'
    }

    try {
      const stamp = Date.now()
      const grouped = data.reduce(
        (curr, item) => {
          (curr[item.relay.primary_address_hex] ||= []).push(item)

          return curr
        },
        {} as Record<string, VerificationResults>
      )
      const filled = []
      for (const hex_id in grouped) {
        filled.push({
          h3cell: hex_id,
          claimable: grouped[hex_id]
            .filter(v => v.result == 'OK' || v.result == 'AlreadyRegistered')
            .length,
          verified: grouped[hex_id]
            .filter(v => v.result == 'AlreadyVerified')
            .length,
          running: grouped[hex_id]
            .filter(v => v.relay.running)
            .length,
          running_verified: grouped[hex_id]
            .filter(v => v.relay.running && v.result == 'AlreadyVerified')
            .length
        })
      }

      const response = await this.bundlingService.upload(
        JSON.stringify(filled),
        {
          tags: [
            { name: 'Protocol', value: 'ator' },
            { name: 'Protocol-Version', value: '0.1' },
            { name: 'Content-Timestamp', value: stamp.toString() },
            { name: 'Content-Type', value: 'application/json' },
            { name: 'Entity-Type', value: 'relay/hex-map' }
          ]
        }
      )
      this.logger.log(
          `Permanently stored relay hex map ${stamp}`
            + ` with ${data.length} relay(s): ${response.id} `
      )

      return response.id
    } catch (error) {
      this.logger.warn(
        `Exception when storing relay hex map: ${error}`,
        error.stack
      )
    }

    return ''
  }

  private async storeRelayMetrics(
    stamp: number,
    data: VerificationResults
  ): Promise<string> {
    if (this.isLive !== 'true') {
      this.logger.warn(
        `NOT LIVE: Not storing relay/metrics ${stamp} with` +
          ` ${data.length} relay(s) `
      )

      return 'not-live-skipped-store-relay-metrics'
    }

    this.logger.warn('RELAY METRICS PUBLISHING IS DISABLED')

    return 'relay-metrics-publishing-disabled'

    // try {
    //   const response = await this.bundlingService.upload(
    //     JSON.stringify(data),
    //     {
    //       tags: [
    //         { name: 'Protocol', value: 'ator' },
    //         { name: 'Protocol-Version', value: '0.1' },
    //         { name: 'Content-Timestamp', value: stamp.toString() },
    //         { name: 'Content-Type', value: 'application/json' },
    //         { name: 'Entity-Type', value: 'relay/metrics' }
    //       ]
    //     }
    //   )
    //   this.logger.log(
    //     `Permanently stored relay/metrics ${stamp} with` +
    //       ` ${data.length} relay(s): ${response.id}`
    //   )

    //   return response.id
    // } catch (e) {
    //   this.logger.warn(`Exception when storing relay metrics: ${e}`)
    // }

    // return ''
  }

  private async storeValidationStats(
    stamp: number,
    data: RelayValidationStatsDto
  ): Promise<string> {
    if (this.isLive !== 'true') {
      this.logger.warn(`NOT LIVE: Not storing validation/stats ${stamp}`)

      return 'not-live-skipped-store-validation-stats'
    }

    try {
      const response = await this.bundlingService.upload(
        JSON.stringify(data),
        {
          tags: [
            { name: 'Protocol', value: 'ator' },
            { name: 'Protocol-Version', value: '0.1' },
            { name: 'Content-Timestamp', value: stamp.toString() },
            { name: 'Content-Type', value: 'application/json' },
            { name: 'Entity-Type', value: 'validation/stats' }
          ]
        }
      )

      this.logger.log(
        `Permanently stored validation/stats ${stamp}: ${response.id}`
      )

      return response.id
    } catch (e) {
      this.logger.warn(`Exception when storing validation stats: ${e}`)
    }

    return ''
  }

  private getValidationStats(
    data: VerificationResults
  ): RelayValidationStatsDto {
    return data.reduce(
      (previous, current, index, array) => {
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
        .map((value) => ({
          fingerprint: value.relay.fingerprint,
          address: value.relay.ator_address,
          score: value.relay.consensus_weight
        }))
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
    const failed = data.filter(value => value.result === 'Failed')
    if (failed.length > 0) {
      this.logger.warn(
        `Failed verification of ${failed.length} relay(s): [${failed
          .map((result, index, array) => result.relay.fingerprint)
          .join(', ')}]`
      )
    }

    const hardwareFailed = data.filter(
      value => value.result === 'HardwareProofFailed'
    )
    if (hardwareFailed.length > 0) {
      this.logger.warn(
        `Failed hardware verification of ${hardwareFailed.length} relay(s): [${
          hardwareFailed
            .map((result, index, array) => result.relay.fingerprint)
            .join(', ')
        }]`
      )
    }

    const aoMessageFailed = data.filter(value => value.result === 'AOMessageFailed')
    if (aoMessageFailed.length > 0) {
      this.logger.error(
        `AO Message Failed when adding ${aoMessageFailed.length} relay(s): [${
          aoMessageFailed
            .map((result, index, array) => result.relay.fingerprint)
            .join(', ')
        }]`
      )
    }

    const claimable = data.filter(value => value.result === 'AlreadyRegistered')
    if (claimable.length > 0) {
      this.logger.log(
        `Skipped ${claimable.length} already registered/claimable relay(s)`
      )
    }

    const alreadyVerified = data.filter(
      value => value.result === 'AlreadyVerified'
    )
    if (alreadyVerified.length > 0) {
      this.logger.log(`Skipped ${alreadyVerified.length} verified relay(s)`)
    }

    const ok = data.filter((value, index, array) => value.result === 'OK')
    if (ok.length > 0) {
      this.logger.log(`Registered (for user claims) ${ok.length} relay(s)`)
    }

    const verifiedRelays = data.filter(
      value => value.result === 'AlreadyVerified'
    )
    this.logger.log(`Total already verified relays: ${verifiedRelays.length}`)
  }

  public async verifyRelays(
    relays: ValidatedRelay[]
  ): Promise<VerificationResults> {
    const results: VerificationResults = []

    // NB: Filter out already claimed or verified relays
    const {
      ClaimableFingerprintsToOperatorAddresses: claimable,
      VerifiedFingerprintsToOperatorAddresses: verified,
      VerifiedHardwareFingerprints
    } = await this.operatorRegistryService.getOperatorRegistryState()
    const alreadyClaimableFingerprints = Object.keys(claimable)
    const alreadyVerifiedFingerprints = Object.keys(verified)
    const relaysToAddAsClaimable: {
      relay: ValidatedRelay,
      isHardwareProofValid?: boolean
    }[] = []
    for (const relay of relays) {
      const isAlreadyClaimable = alreadyClaimableFingerprints.includes(
        relay.fingerprint
      )
      const isAlreadyVerified = alreadyVerifiedFingerprints.includes(
        relay.fingerprint
      )

      if (relay.ator_address === '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF') {
        this.logger.log(
          `Failing relay ${relay.fingerprint}` +
            ` with dummy address ${relay.ator_address}`
        )
        results.push({ relay, result: 'Failed' })
      } else if (isAlreadyClaimable) {
        results.push({ relay, result: 'AlreadyRegistered' })
      } else if (isAlreadyVerified) {
        results.push({ relay, result: 'AlreadyVerified' })
      } else if (!relay.hardware_info) {
        relaysToAddAsClaimable.push({ relay })
      } else if (VerifiedHardwareFingerprints[relay.fingerprint]) {
        relaysToAddAsClaimable.push({ relay })
      } else if (relay.hardware_info) {
        const atecSerial = relay.hardware_info
          ?.serNums
          ?.find((s) => s.type === 'ATEC')
          ?.number
        this.logger.log(
          `Checking hardware proof for relay [${relay.fingerprint}]`
        )
        const existingVerifiedHardware = await this.hardwareVerificationService
          .getVerifiedHardwareByAtecSerial(atecSerial)
        if (existingVerifiedHardware) {
          this.logger.log(
            `Relay [${relay.fingerprint}] tried to verify with ` +
              `ATEC Serial (Unique ID) [${atecSerial}], ` +
              `but it was already verified`
          )

          const { fingerprint: existingFingerprint } = existingVerifiedHardware
          const isExistingFingerprintUnrenounced =
            alreadyClaimableFingerprints.includes(existingFingerprint) ||
            alreadyVerifiedFingerprints.includes(existingFingerprint)
          if (
            existingFingerprint !== relay.fingerprint &&
            isExistingFingerprintUnrenounced
          ) {
            this.logger.log(
              `Relay [${relay.fingerprint}] tried to verify with ` +
                `ATEC Serial (Unique ID) [${atecSerial}], ` +
                `but it was already verified with fingerprint [${existingFingerprint}]`
            )

            results.push({ relay, result: 'HardwareProofFailed' })
            continue
          }
        }

        let isHardwareProofValid = await this
          .hardwareVerificationService
          .isHardwareProofValid(relay)

        if (isHardwareProofValid) {
          relaysToAddAsClaimable.push({ relay, isHardwareProofValid })
        } else {
          results.push({ relay, result: 'HardwareProofFailed' })
        }
      } else {
        this.logger.log(`Failing relay ${relay.fingerprint}`)
        results.push({ relay, result: 'Failed' })
      }
    }

    if (this.isLive === 'true') {
      try {
        if (relaysToAddAsClaimable.length > 0) {
          this.logger.log(
            `Starting to add claimable relays & verified hardware for` +
              ` ${relaysToAddAsClaimable.length} relays`
          )

          const chunks = _.chunk(relaysToAddAsClaimable, 100)
          for (const chunk of chunks) {
            const sleep = 2345
            this.logger.log(
              `Sleeping before submitting next claimable relay batch: ${sleep} ms`
            )
            await new Promise(resolve => setTimeout(resolve, sleep))
            this.logger.log(`Submitting ${chunk.length} claimable relays`)
            const {
              success: adminSubmitOperatorCertificatesSuccess,
              messageId: adminSubmitOperatorCertificatesMessageId
            } = await this
              .operatorRegistryService
              .adminSubmitOperatorCertificates(chunk)

            if (adminSubmitOperatorCertificatesSuccess) {
              this.logger.log(
                `Added ${chunk.length}` +
                  ` claimable relays: ${adminSubmitOperatorCertificatesMessageId}`
              )
              results.concat(
                chunk.map(
                  ({ relay }) => ({ relay, result: 'OK' })
                )
              )
            } else {
              this.logger.error(
                `Adding ${chunk.length} claimable relays` +
                  ` was not successful`
              )

              results.concat(
                chunk.map(
                  ({ relay }) => ({ relay, result: 'AOMessageFailed' })
                )
              )
            }
          }
        } else {
          this.logger.log('No claimable relays to add')
        }
      } catch (error) {
        this.logger.error(
          `Exception when verifying relays [${relaysToAddAsClaimable.length}]`,
          error.stack
        )

        return results.concat(
          relaysToAddAsClaimable.map(
            ({ relay }) => ({ relay, result: 'Failed' })
          )
        )
      }
    } else {
      this.logger.warn(
        `NOT LIVE - skipped contract call to add` +
          ` ${relaysToAddAsClaimable.length} claimable relays`
      )
    }

    return results
  }
}
