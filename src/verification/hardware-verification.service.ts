import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { bytesToHex } from '@noble/curves/abstract/utils'
import { p256 } from '@noble/curves/p256'
import { createHash } from 'crypto'
import {
  Contract as EthersContract,
  JsonRpcProvider,
  toUtf8Bytes,
  WebSocketProvider
} from 'ethers'
import { Model } from 'mongoose'

import relayUpAbi from './interfaces/relay-up-abi'
import { ECPointCompress } from '../util/ec-point-compress'
import { isFingerprintValid } from '../util/fingerprint'
import { isHexStringValid } from '../util/hex-string'
import { ValidatedRelay } from '../validation/schemas/validated-relay'
import { VerifiedHardware } from './schemas/verified-hardware'
import { RelaySaleData } from './schemas/relay-sale-data'
import { HardwareVerificationFailure } from './schemas/hardware-verification-failure'
import { EvmProviderService } from '../evm-provider/evm-provider.service'

@Injectable()
export class HardwareVerificationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(HardwareVerificationService.name)

  // private provider: WebSocketProvider
  private provider: JsonRpcProvider
  private backupProvider: JsonRpcProvider
  private relayupNftContractAddress: string
  private relayupNftContract: EthersContract
  private backupRelayupNftContract: EthersContract

  constructor(
    private readonly config: ConfigService<{
      RELAY_UP_NFT_CONTRACT_ADDRESS: string
    }>,
    private readonly evmProviderService: EvmProviderService,
    @InjectModel(VerifiedHardware.name)
    private readonly verifiedHardwareModel: Model<VerifiedHardware>,
    @InjectModel(RelaySaleData.name)
    private readonly relaySaleDataModel: Model<RelaySaleData>,
    @InjectModel(HardwareVerificationFailure.name)
    private readonly hardwareVerificationFailureModel: Model<HardwareVerificationFailure>
  ) {
    this.logger.log('Initializing HardwareVerificationService')

    this.relayupNftContractAddress = this.config.get<string>(
      'RELAY_UP_NFT_CONTRACT_ADDRESS',
      { infer: true }
    )
    if (!this.relayupNftContractAddress) {
      throw new Error('RELAY_UP_NFT_CONTRACT_ADDRESS is not set!')
    }

    this.logger.log(
      `Initialized with RELAYUP NFT Contract: ${this.relayupNftContractAddress}`
    )
  }

  async onApplicationBootstrap() {
    this.provider = await this.evmProviderService.getCurrentMainnetJsonRpcProvider()
    this.backupProvider = await this.evmProviderService.getBackupMainnetJsonRpcProvider()
    this.relayupNftContract = new EthersContract(
      this.relayupNftContractAddress,
      relayUpAbi,
      this.provider
    )
    this.backupRelayupNftContract = new EthersContract(
      this.relayupNftContractAddress,
      relayUpAbi,
      this.backupProvider
    )

    // this.provider = await this.evmProviderService.getCurrentMainnetWebSocketProvider(
    //   (async (provider: WebSocketProvider) => {
    //     this.logger.log('WebSocketProvider reset.  Recreating RELAYUP NFT Contract')
    //     this.provider = provider
    //     this.relayupNftContract = new EthersContract(
    //       this.relayupNftContractAddress,
    //       relayUpAbi,
    //       this.provider
    //     )
    //   }).bind(this)
    // )
  }

  public async isOwnerOfRelayupNft(address: string, nftId: bigint, contract = this.relayupNftContract, isRetry = false) {
    if (!contract) {
      this.logger.error(
        `Could not check owner of RELAYUP NFT #${nftId}: No Contract`
      )

      return false
    }

    try {
      const owner = await contract.ownerOf(nftId)

      this.logger.debug(`checking address [${address}] as owner of NFT ID #${nftId}: owner result [${owner}]`)

      return address === owner
    } catch (error) {
      if (error.reason !== 'ERC721: invalid token ID') {
        this.logger.error(
          `Error thrown checking owner of NFT ID #${nftId}`,
          error
        )

        if (!isRetry) {
          return await this.isOwnerOfRelayupNft(address, nftId, this.backupRelayupNftContract, true)
        }
      } else {
        this.logger.debug(`NFT ID #${nftId} does not exist. error.reason: ${error.reason}`)
      }

      return false
    }
  }

  public async verifyRelaySerialProof(
    nodeId: string,
    nftId: number,
    deviceSerial: string,
    atecSerial: string,
    fingerprint: string,
    address: string,
    publicKey: string,
    signature: string
  ) {
    if (!isFingerprintValid(fingerprint)) {
      this.logger.log('Invalid fingerprint', fingerprint)

      return false
    }

    const nodeIdHex = bytesToHex(toUtf8Bytes(nodeId))

    const isDeviceSerialValid =
      deviceSerial.length === 16 && isHexStringValid(deviceSerial)
    if (!isDeviceSerialValid) {
      this.logger.log('Invalid device serial', deviceSerial)

      return false
    }

    const isAtecSerialValid =
      atecSerial.length === 18 && isHexStringValid(atecSerial)
    if (!isAtecSerialValid) {
      this.logger.log('Invalid atec serial', atecSerial)

      return false
    }

    const isSignatureFormatValid =
      signature.length === 128 && isHexStringValid(signature)
    if (!isSignatureFormatValid) {
      this.logger.log('Invalid signature', signature)

      return false
    }

    const nftIdHex = nftId.toString(16).padStart(4, '0')
    const nftIdHexLsb = [
      nftIdHex[2],
      nftIdHex[3],
      nftIdHex[0],
      nftIdHex[1]
    ].join('')
    const messageHexString = (
      nodeIdHex +
      nftIdHexLsb +
      deviceSerial +
      atecSerial +
      fingerprint +
      address.substring(2)
    ).toLowerCase()
    const message = Uint8Array.from(
      (messageHexString.match(/.{1,2}/g) || []).map((byte) =>
        parseInt(byte, 16)
      )
    )
    const messageHash = createHash('sha256').update(message).digest('hex')
    const publicKeyBytes = Uint8Array.from(
      (publicKey.match(/.{1,2}/g) || []).map((byte) => parseInt(byte, 16))
    )
    const publicKeyCompressed = ECPointCompress(
      publicKeyBytes.slice(0, publicKeyBytes.length / 2),
      publicKeyBytes.slice(publicKeyBytes.length / 2)
    )

    return p256.verify(signature, messageHash, publicKeyCompressed)
  }

  private async validateDeviceSerial(
    fingerprint: string,
    deviceSerial?: string
  ): Promise<boolean> {
    if (!deviceSerial) {
      this.logger.log(
        `Missing Device Serial in hardware info for relay [${fingerprint}]`
      )

      return false
    }

    const existingVerifiedHardwareByDeviceSerial =
      await this.verifiedHardwareModel.exists({ deviceSerial }).exec()

    if (existingVerifiedHardwareByDeviceSerial) {
      this.logger.log(
        `Relay [${fingerprint}] tried to verify with ` +
          `Device Serial [${deviceSerial}], but it was already verified`
      )

      return false
    }

    return true
  }

  private async validateAtecSerial(
    fingerprint: string,
    atecSerial?: string
  ): Promise<boolean> {
    if (!atecSerial) {
      this.logger.log(
        `Missing ATEC Serial in hardware info for relay [${fingerprint}]`
      )

      return false
    }

    const existingVerifiedHardwareByAtecSerial =
      await this.verifiedHardwareModel.exists({ atecSerial }).exec()
    if (existingVerifiedHardwareByAtecSerial) {
      this.logger.log(
        `Relay [${fingerprint}] tried to verify with ` +
          `ATEC Serial [${atecSerial}], but it was already verified.`
      )

      return false
    }

    return true
  }

  /**
   * Check deviceSerial against known RelaySaleData
   *   - if no known RelaySaleData, fail
   *   - if nft ids don't match, fail
   *   - if address does not currently own nft id, fail
   *   - else, pass and return parsed nft id
   *
   * @todo Handle nftId of 0 for future relay sales / known relays
   */
  private async validateNftIdForAddressAndDeviceSerial({
    fingerprint,
    address,
    // deviceSerial,
    nftId
  }: {
    fingerprint: string
    address: string
    deviceSerial?: string
    nftId?: string
  }): Promise<{ valid: false } | { valid: true; nftId: number }> {
    if (!nftId) {
      this.logger.log(
        `Missing NFT ID in hardware info for relay [${fingerprint}]`
      )

      return { valid: false }
    }
    const parsedNftId = Number.parseInt(nftId)
    const isNftIdValid = Number.isInteger(parsedNftId)
    if (!isNftIdValid) {
      this.logger.log(
        `Invalid NFT ID [${parsedNftId}] in hardware info for ` +
          `relay [${fingerprint}]`
      )
    }
    // const existingVerifiedHardwareByNftId = await this
    //   .verifiedHardwareModel
    //   .exists({ nftId: parsedNftId })
    //   .exec()
    // if (existingVerifiedHardwareByNftId) {
    //   this.logger.log(
    //     `Relay [${fingerprint}] tried to verify with `
    //       + `NFT ID [${parsedNftId}], but it was already verified`
    //   )

    //   return { valid: false }
    // }

    // NB: Skip relay sale data checks for now
    // const relaySaleData = await this
    //   .relaySaleDataModel
    //   .findOne({ serial: (deviceSerial || '').toLowerCase() })
    //   .exec()
    // if (!relaySaleData || !deviceSerial) {
    //   this.logger.log(
    //     `Relay [${fingerprint}] tried to verify with `
    //       + `NFT ID [${parsedNftId}] and Device Serial [${deviceSerial}], `
    //       + `but no known RelaySaleData matches`
    //   )

    //   return { valid: false }
    // }
    // if (relaySaleData.nftId !== parsedNftId) {
    //   this.logger.log(
    //     `Relay [${fingerprint}] tried to verify with `
    //       + `NFT ID [${parsedNftId}] and Device Serial [${deviceSerial}], `
    //       + `but we expected NFT ID [${relaySaleData.nftId}]`
    //   )

    //   return { valid: false }
    // }

    const isAddressOwnerOfNftId = await this.isOwnerOfRelayupNft(
      address,
      BigInt(parsedNftId)
    )
    if (!isAddressOwnerOfNftId) {
      this.logger.log(`NFT ID [${parsedNftId}] is not owned by ${address}`)

      return { valid: false }
    }

    return { valid: true, nftId: parsedNftId }
  }

  public async isHardwareProofValid({
    ator_address: address,
    fingerprint,
    hardware_info
  }: ValidatedRelay): Promise<boolean> {
    const isValid = await (async () => {
      if (!hardware_info) {
        return false
      }

      const { nftid: nftId, serNums, pubKeys, certs } = hardware_info

      const deviceSerial = serNums?.find((s) => s.type === 'DEVICE')?.number
      // const isDeviceSerialValid = await this.validateDeviceSerial(
      //   fingerprint,
      //   deviceSerial
      // )
      // if (!isDeviceSerialValid) { return false }

      const atecSerial = serNums?.find((s) => s.type === 'ATEC')?.number
      // const isAtecSerialValid = await this.validateAtecSerial(
      //   fingerprint,
      //   atecSerial
      // )
      // if (!isAtecSerialValid) { return false }

      const publicKey = pubKeys?.find((p) => p.type === 'DEVICE')?.number
      // if (!publicKey) {
      //   this.logger.debug(
      //     `Missing Public Key in hardware info for relay [${fingerprint}]`
      //   )

      //   return false
      // }

      const signature = certs?.find((c) => c.type === 'DEVICE')?.signature
      // if (!signature) {
      //   this.logger.debug(
      //     `Missing Signature in hardware info for relay [${fingerprint}]`
      //   )

      //   return false
      // }

      const validateNftResult =
        await this.validateNftIdForAddressAndDeviceSerial({
          fingerprint,
          address,
          deviceSerial: deviceSerial || '',
          nftId
        })
      if (!validateNftResult.valid) {
        return false
      }

      // const isHardwareProofValid = await this.verifyRelaySerialProof(
      //   'relay',
      //   validateNftResult.nftId,
      //   deviceSerial!,
      //   atecSerial!,
      //   fingerprint,
      //   address,
      //   publicKey,
      //   signature
      // )
      // NB: Skip checking signature proofs for now
      // if (!isHardwareProofValid) {
      //   this.logger.debug(
      //     `Hardware info proof failed verification for relay [${fingerprint}]`
      //   )

      //   return false
      // }

      await this.verifiedHardwareModel.create({
        verified_at: Date.now(),
        deviceSerial,
        atecSerial,
        fingerprint,
        address,
        publicKey,
        signature,
        nftId: validateNftResult.nftId
      })

      return true
    })()

    if (!isValid) {
      this.logger.log(
        `Storing hardware verification failure for ${fingerprint}`
      )
      await this.hardwareVerificationFailureModel.create({
        fingerprint,
        address,
        timestamp: Date.now(),
        hardware_info
      })
    }

    return isValid
  }
}
