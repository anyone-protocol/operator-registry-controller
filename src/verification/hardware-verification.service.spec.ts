import { Test, TestingModule } from '@nestjs/testing'
import { ConfigModule } from '@nestjs/config'
import { getModelToken } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import fs from 'fs'

import { EvmProviderService } from '../evm-provider/evm-provider.service'
import { HardwareVerificationService } from './hardware-verification.service'
import { VerifiedHardware } from './schemas/verified-hardware'
import { RelaySaleData } from './schemas/relay-sale-data'
import {
  HardwareVerificationFailure
} from './schemas/hardware-verification-failure'
import { VaultService } from '../vault/vault.service'
import {
  VaultReadIssuerResponse
} from '../vault/dto/vault-read-issuer-response'

const CA_CERT = fs.readFileSync(`test/ca_cert.pem`, 'utf8')
const DEVICE_CERT = fs.readFileSync(`test/device_cert.pem`, 'utf8')
const DEVICE_SN = '0123FAE8C4E4FEB2D9'
const DEVICE_SAN_FINGERPRINT = 'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'
const DEVICE_CERT_BAD_SN = fs.readFileSync(`test/device_cert_bad_sn.pem`, 'utf8')
const DEVICE_BAD_SN = 'FFFFFFFFFFFFFFFFFF'
const DEVICE_CERT_NO_SAN_FINGERPRINT = fs.readFileSync(`test/device_cert_no_san_fingerprint.pem`, 'utf8')
const DEVICE_BAD_SAN_FINGERPRINT = '1111111111111111111111111111111111111111'
const CA_CERT_ISSUER: VaultReadIssuerResponse = {
  ca_chain: [CA_CERT],
  certificate: CA_CERT,
  crl_distribution_points: [],
  issuer_id: 'mock-issuer-id',
  issuer_name: 'mock-issuer-name',
  issuing_certificates: [],
  key_id: '',
  leaf_not_after_behavior: 'err',
  manual_chain: null,
  ocsp_servers: [],
  revocation_signature_algorithm: '',
  revoked: false,
  usage: 'crl-signing,issuing-certificates,ocsp-signing,read-only'
}

describe('HardwareVerificationService', () => {
  let module: TestingModule
  let service: HardwareVerificationService
  let mockVaultService: VaultService
  let mockVerifiedHardwareModel: Model<VerifiedHardware>
  let mockRelaySaleDataModel: Model<RelaySaleData>
  let mockHardwareVerificationFailureModel: Model<HardwareVerificationFailure>

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [
        HardwareVerificationService,
        {
          provide: getModelToken(VerifiedHardware.name),
          useValue: {
            new: jest.fn(),
            constructor: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            exec: jest.fn(),
            insertMany: jest.fn()
          }
        },
        {
          provide: getModelToken(RelaySaleData.name),
          useValue: {
            new: jest.fn(),
            constructor: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            exec: jest.fn(),
            insertMany: jest.fn()
          }
        },
        {
          provide: getModelToken(HardwareVerificationFailure.name),
          useValue: {
            new: jest.fn(),
            constructor: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            exec: jest.fn(),
            insertMany: jest.fn()
          }
        },
        {
          provide: EvmProviderService,
          useValue: {
            new: jest.fn(),
            constructor: jest.fn(),
            onApplicationShutdown: jest.fn(),
            onApplicationBootstrap: jest.fn(),
            getCurrentWebSocketProvider: jest.fn().mockReturnValue(
              new Promise(resolve => resolve(jest.fn()))
            ),
            getCurrentMainnetWebSocketProvider: jest.fn().mockReturnValue(
              new Promise(resolve => resolve(jest.fn()))
            ),
            getCurrentMainnetJsonRpcProvider: jest.fn().mockReturnValue(
              new Promise(resolve => resolve(jest.fn()))
            ),
            getBackupMainnetJsonRpcProvider: jest.fn().mockReturnValue(
              new Promise(resolve => resolve(jest.fn()))
            )
          }
        },
        {
          provide: VaultService,
          useValue: {
            new: jest.fn(),
            constructor: jest.fn(),
            getIssuerBySKI: jest.fn()
          }
        }
      ]
    }).compile()
    mockVerifiedHardwareModel = module.get<Model<VerifiedHardware>>(
      getModelToken(VerifiedHardware.name)
    )
    mockRelaySaleDataModel = module.get<Model<RelaySaleData>>(
      getModelToken(RelaySaleData.name)
    )
    mockHardwareVerificationFailureModel =
      module.get<Model<HardwareVerificationFailure>>(
        getModelToken(HardwareVerificationFailure.name)
      )
    mockVaultService = module.get<VaultService>(VaultService)
    service = module.get<HardwareVerificationService>(
      HardwareVerificationService
    )
  })

  afterEach(async () => {
    await module.close()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('Validating Device Certificates', () => {
    it('should reject unreadable device certs', async () => {
      const badDeviceCert = 'bad-device-cert'
      const { valid } = await service.validateDeviceCertificate(
        badDeviceCert,
        DEVICE_SAN_FINGERPRINT
      )
      expect(valid).toBe(false)
    })

    it('should reject device certs with no matching issuer', async () => {
      jest.spyOn(mockVaultService, 'getIssuerBySKI').mockResolvedValue(null)
      const { valid } = await service.validateDeviceCertificate(
        DEVICE_CERT_NO_SAN_FINGERPRINT,
        DEVICE_SAN_FINGERPRINT
      )
      expect(valid).toBe(false)
    })

    it('should reject device certs if SAN fingerprint does not match fingerprint', async () => {
      jest.spyOn(mockVaultService, 'getIssuerBySKI').mockResolvedValue(CA_CERT_ISSUER)
      const { valid } = await service.validateDeviceCertificate(
        DEVICE_CERT_NO_SAN_FINGERPRINT,
        DEVICE_BAD_SAN_FINGERPRINT
      )
      expect(valid).toBe(false)
    })

    it('should validate device certs with matching issuer, serial number, & SAN fingerprint', async () => {
      jest.spyOn(mockVaultService, 'getIssuerBySKI').mockResolvedValue(CA_CERT_ISSUER)
      const { valid } = await service.validateDeviceCertificate(
        DEVICE_CERT,
        DEVICE_SAN_FINGERPRINT
      )
      expect(valid).toBe(true)
    })
  })

  it.skip('should check owner of valid nft id', async () => {
    const address = '0xe96caef5e3b4d6b3F810679637FFe95D21dEFa5B'
    const nftId = BigInt(621)

    const isOwnerOfRelayupNft = await service.isOwnerOfRelayupNft(
      address,
      nftId
    )

    expect(isOwnerOfRelayupNft).toBe(true)
  })

  it.skip('should check owner of invalid nft id', async () => {
    const address = '0xe96caef5e3b4d6b3F810679637FFe95D21dEFa5B'
    const nftId = BigInt(999)

    const isOwnerOfRelayupNft = await service.isOwnerOfRelayupNft(
      address,
      nftId
    )

    expect(isOwnerOfRelayupNft).toBe(false)
  })

  it.skip('should validate hardware serial proofs', async () => {
    // tbs_digest: 72656c61790000c2eeefaa42a5007301237da6e721fcee0189a5ef566c85e88391886220f7439dedd967ef626d456e61876334ee2ca473e3b4b66777c931886e
    // tbs_digest_sha256: 7613148017599b032f14a5aacc6a8643642aafdc075cccc7e56573673d20bf4e
    // Signature: 8f91a418bbd6e9d2f0e73a987957e686c6373f13c7560520b84813dc25959b636b785054cc4751cd062214db8ffba1462634fa8001e4b4b725cbbfcc0bf6b653
    // Public-Key: 8ac7f77ca08a2402424608694e76cf9a126351cf62b27204c96b0d5d71887634240bf6a034d08c54dd7ea66c46cec9b97bf9861931bd3e69c2eac899551a66cb
    // Signature verified: 1

    // const nftId = 0
    // const deviceSerial = 'c2eeefaa42a50073'
    // const atecSerial = '01237da6e721fcee01'
    // const fingerprint = '6CF7AA4F7C8DABCF523DC1484020906C0E0F7A9C'
    // const address = '0x01FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF02'
    // const publicKey = '8ac7f77ca08a2402424608694e76cf9a126351cf62b27204c96b0d5d71887634240bf6a034d08c54dd7ea66c46cec9b97bf9861931bd3e69c2eac899551a66cb'
    // const signature = 'e84dad1da3bbc25e60d3e54676ad1610172a2239bb571db9031dd8ca1973c4bab68b23f9a94ecab9396433499333963889f4ebcce79e3f219dab93956b4719ef'
    // const signature = 'ec6fe2876f959bcdd1df819bde3617667edd62e8fffba5f645fe86eae4602766830199fef0f449b750ae92f9f2f87a2232af7f3bd62986810d8b0d4df6081446'

    // const nftId = 49
    // const deviceSerial = 'd27c4beb70f6250d'
    // const atecSerial = '0123b5bbd2261b5701'
    // const fingerprint = 'A786266527B9757D5B1639B045C34EC8FB597396'
    // const address = '0x6D454e61876334ee2Ca473E3b4B66777C931886E'
    // const publicKey = '388ce1d5c1352313c43a4cdd6443d65f087ade8724b48103eee2478a29bfdf64177f32973eb30f611f0d4fc39db7e8413a2e53e4fa2a90b8ad92949e195f409c'
    // const signature = '634c6dece6ed02bb3979c6433880cd63c88b9e53e4a06f9147ef8f14013a3cfb3b6323436cfe36c4f6d3630eb2d7da8c6e3345790b57ac6755d37b13f715e76e'

    // const nftId = 0
    // const deviceSerial = 'c2eeefaa42a50073'
    // // const deviceSerial = 'c2eeef8a42a50073'
    // const atecSerial = '01237da6e721fcee01'
    // // const atecSerial = '01237da6e721dcce01'
    // const fingerprint = '89A5EF566C85E88391886220F7439DEDD967EF62'
    // // const address = '0x6D454e61876334ee2Ca473E3b4B66777C931886E'
    // const address = '0x6D456e61876334ee2Ca473E3b4B66777C931886E'
    // const publicKey = '8ac7f77ca08a2402424608694e76cf9a126351cf62b27204c96b0d5d71887634240bf6a034d08c54dd7ea66c46cec9b97bf9861931bd3e69c2eac899551a66cb'
    // const signature = '8f91a418bbd6e9d2f0e73a987957e686c6373f13c7560520b84813dc25959b636b785054cc4751cd062214db8ffba1462634fa8001e4b4b725cbbfcc0bf6b653'

    const nftId = 0
    const deviceSerial = 'c2eeef8a42a50073'
    const atecSerial = '01237da6e721dcce01'
    const fingerprint = '89A5EF566C85E88391886220F7439DEDD967EF62'
    const address = '0x6d454e61876334ee2ca473e3b4b66777c931886e'
    const publicKey =
      '8ac7f77ca08a2402424608694e76cf9a126351cf62b27204c96b0d5d71887634240bf6a034d08c54dd7ea66c46cec9b97bf9861931bd3e69c2eac899551a66cb'
    const signature =
      'f9fd49a43376f7dae87c2c95f14553feec317e93967db97bdcf7b5232616d551167555f90173bf6178f7e8a2aa71834932dbcdff26f0ae26b88c00cb0d09f174'

    const result = await service.verifyRelaySerialProof(
      'relay',
      nftId,
      deviceSerial,
      atecSerial,
      fingerprint,
      address,
      publicKey,
      signature
    )

    expect(result).toBe(true)
  })
})
