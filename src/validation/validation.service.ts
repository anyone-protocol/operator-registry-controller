import { Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { AxiosError } from 'axios'
import { firstValueFrom, catchError } from 'rxjs'
import { DetailsResponse } from './interfaces/8_3/details-response'
import { RelayInfo } from './interfaces/8_3/relay-info'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { RelayData } from './schemas/relay-data'
import { RelayDataDto } from './dto/relay-data-dto'
import { ethers } from 'ethers'
import { ConfigService } from '@nestjs/config'
import { ValidationData } from './schemas/validation-data'
import { ValidatedRelay } from './schemas/validated-relay'
import { latLngToCell } from 'h3-js'
import * as geoip from 'geoip-lite'
import extractIsodate from '../util/extract-isodate'
import { RelayUptime } from './schemas/relay-uptime'
import { GeoIpService } from '../geo-ip/geo-ip.service'

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name)
  private lastSeen: string = ''

  // this pattern should be lowercase
  private readonly atorKeyPattern = '@anon:'

  private readonly keyLength = 42

  private readonly bannedFingerprints: string[]

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService<{
      ONIONOO_DETAILS_URI: string
      DETAILS_URI_AUTH: string
      BANNED_FINGERPRINTS: string
    }>,
    @InjectModel(RelayData.name)
    private readonly relayDataModel: Model<RelayData>,
    @InjectModel(ValidationData.name)
    private readonly validationDataModel: Model<ValidationData>,
    @InjectModel(RelayUptime.name)
    private readonly relayUptimeModel: Model<RelayUptime>,
    @InjectModel(ValidatedRelay.name)
    private readonly validatedRelayModel: Model<ValidatedRelay>,
    private readonly geoipService: GeoIpService
  ) {
    this.logger.log(`Bootstrapping Validation Service`)
    // geoip.startWatchingDataUpdate()

    const bannedFingerprintsString = config.get<string>(
      'BANNED_FINGERPRINTS',
      { infer: true }
    ) || ''
    this.bannedFingerprints = bannedFingerprintsString.split(',')
    this.logger.log(
      `Bootstrapped Validation Service with ${this.bannedFingerprints.length}` +
        ` banned fingerprints: ${JSON.stringify(this.bannedFingerprints)}`
    )
  }

  public async fetchNewRelays(): Promise<RelayInfo[]> {
    this.logger.log(`Fetching new relays [seen: ${this.lastSeen}]`)

    let relays: RelayInfo[] = []
    const detailsUri = this.config.get<string>('ONIONOO_DETAILS_URI', {
      infer: true
    })
    if (detailsUri !== undefined) {
      const detailsAuth: string =
        this.config.get<string>('DETAILS_URI_AUTH', {
          infer: true
        }) || ''
      const requestStamp = Date.now()
      try {
        const { headers, status, data } = await firstValueFrom(
          this.httpService
            .get<DetailsResponse>(detailsUri, {
              headers: {
                'content-encoding': 'gzip',
                // 'if-modified-since': `${this.lastSeen}`,
                authorization: `${detailsAuth}`
              },
              validateStatus: (status) => status === 304 || status === 200
            })
            .pipe(
              catchError((error: AxiosError) => {
                this.logger.error(
                  `Fetching relays from ${detailsUri} failed with ${error.response?.status ?? '?'}, ${error}`
                )
                throw 'Failed to fetch relay details'
              })
            )
        )

        this.logger.debug(`Fetch details from ${detailsUri} response ${status}`)
        if (status === 200) {
          relays = data.relays
          const lastMod = headers['last-modified']
          if (
            lastMod !== undefined &&
            typeof lastMod === 'string' &&
            requestStamp > Date.parse(lastMod)
          ) {
            this.lastSeen = new Date(lastMod).toUTCString()
          } else this.lastSeen = ''

          this.logger.log(
            `Received ${relays.length} relays from validated details [seen: ${this.lastSeen}]`
          )
        } else this.logger.debug('No new relay updates from validated details') // 304 - Not modified
      } catch (e) {
        this.logger.error('Exception when fetching new relays', e.stack)
      }
    } else
      this.logger.warn(
        'Set the ONIONOO_DETAILS_URI in ENV vars or configuration'
      )

    return relays
  }

  public extractAtorKey(inputString?: string): string {
    if (inputString !== undefined && inputString.length > 0) {
      const startIndex = inputString.toLowerCase().indexOf(this.atorKeyPattern)
      if (startIndex > -1) {
        const baseIndex = startIndex + this.atorKeyPattern.length
        const fixedInput = inputString.replace('0X', '0x')
        const keyIndex = fixedInput.indexOf('0x', baseIndex)
        if (keyIndex > -1) {
          const endKeyIndex = keyIndex + this.keyLength
          if (endKeyIndex <= fixedInput.length) {
            const keyCandidate = fixedInput.substring(keyIndex, endKeyIndex)
            // this.logger.debug(
            //   `Found key candidate ${keyCandidate} in [${inputString}]`
            // )
            if (ethers.isAddress(keyCandidate))
              return ethers.getAddress(keyCandidate)
            else
              this.logger.warn(
                'Invalid ator key (as checked by ethers) found after pattern in matched relay'
              )
          } else
            this.logger.warn(
              'Invalid ator key candidate found after pattern in matched relay'
            )
        } else
          this.logger.warn(
            `Ator key not found after pattern in matched relay for input: ${inputString}`
          )
      } else
        this.logger.warn(
          `Ator key pattern not found in matched relay for input: ${inputString}`
        )
    } else
      this.logger.warn('Attempting to extract empty key from matched relay')

    return ''
  }

  public async filterRelays(relays: RelayInfo[]): Promise<RelayDataDto[]> {
    this.logger.debug(`Filtering ${relays.length} relays`)

    const matchingRelays = relays.filter(
      (relay) =>
        !this.bannedFingerprints.includes(relay.fingerprint) &&
        relay.contact !== undefined &&
        relay.contact.toLowerCase().includes(this.atorKeyPattern)
    )

    if (matchingRelays.length > 0) {
      this.logger.log(`Filtered ${matchingRelays.length} relays`)
    } else if (relays.length > 0) {
      this.logger.log('No new interesting relays found')
    }

    const relayData = matchingRelays.map<RelayDataDto>((info) => ({
      fingerprint: info.fingerprint,

      // NB: Other case should not happen as its filtered out while
      //     creating validations array
      contact: info.contact !== undefined ? info.contact : '',

      consensus_weight: info.consensus_weight,
      primary_address_hex: this.fingerprintToGeoHex(info.fingerprint),
      nickname: info.nickname,

      running: info.running,
      last_seen: info.last_seen,
      consensus_measured: info.measured ?? false,
      consensus_weight_fraction: info.consensus_weight_fraction ?? 0,
      version: info.version ?? '?',
      version_status: info.version_status ?? '',
      bandwidth_rate: info.bandwidth_rate ?? 0,
      bandwidth_burst: info.bandwidth_burst ?? 0,
      observed_bandwidth: info.observed_bandwidth ?? 0,
      advertised_bandwidth: info.advertised_bandwidth ?? 0,
      effective_family: info.effective_family ?? [],
      hardware_info: info.hardware_info
    }))

    return relayData.filter((relay) => relay.contact.length > 0)
  }

  private fingerprintToGeoHex(fingerprint: string): string {
    const fingerprintGeolocation = this.geoipService.lookup(fingerprint)
    if (fingerprintGeolocation) {
      const [lat, lng] = fingerprintGeolocation.coordinates
      return latLngToCell(lat, lng, 4) // resolution 4 - avg hex area 1,770 km^2
    } else return '?'
  }

  public async validateRelays(
    relaysDto: RelayDataDto[]
  ): Promise<ValidationData> {
    const validated_at = Date.now()

    if (relaysDto.length === 0) {
      this.logger.debug(`No relays to validate at ${validated_at}`)

      return { validated_at, relays: [] }
    }

    const validation_date = extractIsodate(validated_at)
    const validatedRelays: ValidatedRelay[] = []
    const relayDatas: RelayData[] = []
    for (const relay of relaysDto) {
      const ator_address = this.extractAtorKey(relay.contact)
      if (ator_address.length < 1) {
        continue
      }

      const uptime = await this.relayUptimeModel.findOne({
        fingerprint: relay.fingerprint,
        validation_date
      })
      const uptime_days = uptime ? uptime.uptime_days : 0

      validatedRelays.push({
        fingerprint: relay.fingerprint,
        ator_address,
        consensus_weight: relay.consensus_weight,
        consensus_weight_fraction: relay.consensus_weight_fraction,
        observed_bandwidth: relay.observed_bandwidth,
        running: relay.running,
        uptime_days,
        family: relay.effective_family,
        consensus_measured: relay.consensus_measured,
        primary_address_hex: relay.primary_address_hex,
        hardware_info: relay.hardware_info,
        nickname: relay.nickname
      })

      relayDatas.push({
        validated_at: validated_at,
        fingerprint: relay.fingerprint,
        ator_address: ator_address,
        primary_address_hex: relay.primary_address_hex,
        consensus_weight: relay.consensus_weight,
        running: relay.running,
        uptime_days,
        consensus_measured: relay.consensus_measured,
        consensus_weight_fraction: relay.consensus_weight_fraction,
        version: relay.version,
        version_status: relay.version_status,
        bandwidth_rate: relay.bandwidth_rate,
        bandwidth_burst: relay.bandwidth_burst,
        observed_bandwidth: relay.observed_bandwidth,
        advertised_bandwidth: relay.advertised_bandwidth,
        family: relay.effective_family,
        hardware_info: relay.hardware_info,
        nickname: relay.nickname
      })
    }

    this.logger.log(
      `Storing ValidationData at ${validated_at} of ${validatedRelays.length} relays`
    )
    const validationData = {
      validated_at,
      relays: validatedRelays
    }
    try {
      const savedValidatedRelays = await this.validatedRelayModel
        .insertMany<ValidatedRelay>(validatedRelays)
      await this.validationDataModel
        .create<ValidationData>({ ...validationData, relays: [] })
        .catch((error) =>
          this.logger.error('Failed creating validation data model', error.stack)
        )
    } catch (error) {
      this.logger.error('Failed creating validated relay model', error.stack)
    }

    this.logger.debug(
      `Storing RelayData at ${validated_at} of ${relayDatas.length} relays`
    )
    await this.relayDataModel
      .insertMany<RelayData>(relayDatas)
      .catch((error) =>
        this.logger.error('Failed creating relay data model', error.stack)
      )

    return validationData
  }

  public async lastValidationOf(
    fingerprint: string
  ): Promise<RelayData | null> {
    return this.relayDataModel
      .findOne<RelayData>({ fingerprint: fingerprint })
      .sort({ validated_at: 'desc' })
      .exec()
      .catch((error) => {
        this.logger.error(
          'Failed fetching last validation of the relay',
          error.stack
        )
        return null
      })
  }

  public async lastValidation(): Promise<ValidationData | null> {
    return this.validationDataModel
      .findOne<ValidationData>()
      .sort({ validated_at: 'desc' })
      .exec()
      .catch((error) => {
        this.logger.error('Failed fetching last validation', error.stack)
        return null
      })
  }
}
