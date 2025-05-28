import { Test, TestingModule } from '@nestjs/testing'
import { ConfigModule } from '@nestjs/config'
import { getModelToken } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import fs from 'fs'

import { EvmProviderService } from '../evm-provider/evm-provider.service'
import { HardwareVerificationService } from './hardware-verification.service'
import { VerifiedHardware } from './schemas/verified-hardware'
import {
  HardwareVerificationFailure
} from './schemas/hardware-verification-failure'
import { VaultService } from '../vault/vault.service'
import {
  VaultReadIssuerResponse
} from '../vault/dto/vault-read-issuer-response'
import { KnownDevice } from './schemas/known-device.schema'

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
  let mockHardwareVerificationFailureModel: Model<HardwareVerificationFailure>
  let mockKnownDeviceModel: Model<KnownDevice>

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
          provide: getModelToken(KnownDevice.name),
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

  describe.skip('Validating Device Certificates', () => {
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

  describe('Verifying Device Serial Proofs', () => {
    it('Should verify Device Serial Proofs', async () => {
      const nftId = 0
      const atecSerial = '0123c58919bd5b13d9'
      const deviceSerial = '6995B81FF0FE55AD'
      const fingerprint = '9E7AE121AB0CF01C73C16258D02FC91BE7DE3591'
      const address = '0xAaE162E8cBCA6434Fd2CFDbD0B8970F3AF59b1AF'
      const publicKey = 'ce657c7de5b21c917740e17998c745369c37efbee88efd78cd606f3a6248d9aa8e651b31c976e2a392018a27a23cd6545e962ff9307453db2dedac37f0e1e03f'
      const signature = '8d2b22393b2bb6fb6e23e088511c71381c58dd977e9b1d067ca918bb52aabe730a4cfd4f175bac579bd898cf603946a15e03d3cb7dcd2edf16a11de3244bba47'

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

    it('should verify hardware serial proofs', async () => {
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
})
