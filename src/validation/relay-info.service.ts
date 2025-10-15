import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { RelayInfo, RelayInfoDocument } from './schemas/relay-info.schema'
import { RelayDataDto } from './dto/relay-data-dto'

@Injectable()
export class RelayInfoService {
  private readonly logger = new Logger(RelayInfoService.name)

  constructor(
    @InjectModel(RelayInfo.name)
    private readonly relayInfoModel: Model<RelayInfoDocument>
  ) {}

  /**
   * Create or update relay info in the database
   * @param relayData Array of relay data to store
   * @returns Array of fingerprints that were stored
   */
  async upsertMany(relayData: RelayDataDto[]): Promise<string[]> {
    const fingerprints: string[] = []

    try {
      for (const relay of relayData) {
        await this.relayInfoModel.updateOne(
          { fingerprint: relay.fingerprint },
          {
            $set: {
              any1_address: relay.any1_address,
              contact: relay.contact,
              primary_address_hex: relay.primary_address_hex,
              nickname: relay.nickname,
              running: relay.running,
              consensus_weight: relay.consensus_weight,
              consensus_measured: relay.consensus_measured,
              consensus_weight_fraction: relay.consensus_weight_fraction,
              version: relay.version,
              version_status: relay.version_status,
              bandwidth_rate: relay.bandwidth_rate,
              bandwidth_burst: relay.bandwidth_burst,
              observed_bandwidth: relay.observed_bandwidth,
              advertised_bandwidth: relay.advertised_bandwidth,
              effective_family: relay.effective_family,
              hardware_info: relay.hardware_info,
              createdAt: Date.now()
            }
          },
          { upsert: true }
        )
        fingerprints.push(relay.fingerprint)
      }

      this.logger.log(`Stored ${fingerprints.length} relay info records`)
    } catch (error) {
      this.logger.error(
        `Error storing relay info: ${error.message}`,
        error.stack
      )
      throw error
    }

    return fingerprints
  }

  /**
   * Update any1_address for a relay
   * @param fingerprint Relay fingerprint
   * @param any1_address The any1 address to set
   */
  async updateAny1Address(
    fingerprint: string,
    any1_address: string
  ): Promise<void> {
    try {
      await this.relayInfoModel.updateOne(
        { fingerprint },
        { $set: { any1_address } }
      )
    } catch (error) {
      this.logger.error(
        `Error updating any1_address for ${fingerprint}: ${error.message}`,
        error.stack
      )
      throw error
    }
  }

  /**
   * Get relay info by fingerprints
   * @param fingerprints Array of relay fingerprints
   * @returns Array of RelayDataDto objects
   */
  async getByFingerprints(fingerprints: string[]): Promise<RelayDataDto[]> {
    try {
      const relays = await this.relayInfoModel
        .find({ fingerprint: { $in: fingerprints } })
        .exec()

      return relays.map(relay => this.toRelayDataDto(relay))
    } catch (error) {
      this.logger.error(
        `Error fetching relay info: ${error.message}`,
        error.stack
      )
      throw error
    }
  }

  /**
   * Get relay info by fingerprints with pagination
   * @param fingerprints Array of relay fingerprints
   * @param batchSize Number of relays to fetch per batch
   * @param onBatch Callback called for each batch of relays
   */
  async getByFingerprintsPaginated(
    fingerprints: string[],
    batchSize: number,
    onBatch: (batch: RelayDataDto[], batchIndex: number, totalBatches: number) => Promise<void>
  ): Promise<void> {
    const totalBatches = Math.ceil(fingerprints.length / batchSize)
    
    for (let i = 0; i < fingerprints.length; i += batchSize) {
      const batchFingerprints = fingerprints.slice(i, i + batchSize)
      const batchIndex = Math.floor(i / batchSize) + 1
      
      try {
        const relays = await this.relayInfoModel
          .find({ fingerprint: { $in: batchFingerprints } })
          .exec()

        const batch = relays.map(relay => this.toRelayDataDto(relay))
        await onBatch(batch, batchIndex, totalBatches)
      } catch (error) {
        this.logger.error(
          `Error fetching relay info batch ${batchIndex}/${totalBatches}: ${error.message}`,
          error.stack
        )
        throw error
      }
    }
  }

  /**
   * Update any1_address for multiple relays in a batch
   * @param updates Array of {fingerprint, any1_address} pairs
   */
  async updateAny1AddressBatch(
    updates: Array<{ fingerprint: string; any1_address: string }>
  ): Promise<void> {
    try {
      const bulkOps = updates.map(({ fingerprint, any1_address }) => ({
        updateOne: {
          filter: { fingerprint },
          update: { $set: { any1_address } }
        }
      }))

      if (bulkOps.length > 0) {
        await this.relayInfoModel.bulkWrite(bulkOps)
      }
    } catch (error) {
      this.logger.error(
        `Error batch updating any1_address: ${error.message}`,
        error.stack
      )
      throw error
    }
  }

  /**
   * Delete relay info by fingerprints
   * @param fingerprints Array of relay fingerprints to delete
   */
  async deleteByFingerprints(fingerprints: string[]): Promise<number> {
    try {
      const result = await this.relayInfoModel
        .deleteMany({ fingerprint: { $in: fingerprints } })
        .exec()

      this.logger.log(
        `Cleaned up ${result.deletedCount} relay info records`
      )
      return result.deletedCount
    } catch (error) {
      this.logger.error(
        `Error deleting relay info: ${error.message}`,
        error.stack
      )
      throw error
    }
  }

  /**
   * Delete all relay info from the collection
   * Used to clean up all transient data after verification is complete
   */
  async deleteAll(): Promise<number> {
    try {
      const result = await this.relayInfoModel
        .deleteMany({})
        .exec()

      this.logger.log(
        `Cleaned up all ${result.deletedCount} relay info records from collection`
      )
      return result.deletedCount
    } catch (error) {
      this.logger.error(
        `Error deleting all relay info: ${error.message}`,
        error.stack
      )
      throw error
    }
  }

  /**
   * Convert RelayInfo document to RelayDataDto
   */
  private toRelayDataDto(relay: RelayInfoDocument): RelayDataDto {
    return {
      fingerprint: relay.fingerprint,
      any1_address: relay.any1_address,
      contact: relay.contact,
      primary_address_hex: relay.primary_address_hex,
      nickname: relay.nickname,
      running: relay.running,
      consensus_weight: relay.consensus_weight,
      consensus_measured: relay.consensus_measured,
      consensus_weight_fraction: relay.consensus_weight_fraction,
      version: relay.version,
      version_status: relay.version_status,
      bandwidth_rate: relay.bandwidth_rate,
      bandwidth_burst: relay.bandwidth_burst,
      observed_bandwidth: relay.observed_bandwidth,
      advertised_bandwidth: relay.advertised_bandwidth,
      effective_family: relay.effective_family,
      hardware_info: relay.hardware_info
    }
  }
}
