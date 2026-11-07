import { Logger } from '@nestjs/common'
import { VerificationService } from './verification.service'

const fingerprint = (character: string) => character.repeat(40)

const relay = (relayFingerprint: string) => ({
  fingerprint: relayFingerprint,
  any1_address: '0x0000000000000000000000000000000000000001'
})

describe('VerificationService submission results', () => {
  beforeEach(() => {
    jest.spyOn(global, 'setTimeout').mockImplementation(((callback: () => void) => {
      callback()
      return 0
    }) as any)
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => jest.restoreAllMocks())

  const verify = (relays: object[], success: boolean) => {
    const operatorRegistry = {
      getOperatorRegistryState: async () => ({
        claimable: {},
        verified: { [fingerprint('D')]: '0x0000000000000000000000000000000000000002' },
        verifiedHardware: {}
      }),
      adminSubmitOperatorCertificates: jest.fn(async () => ({ success, messageId: 'message-id' }))
    }
    const service = new VerificationService(
      { get: () => 'true' } as any,
      {} as any,
      {} as any,
      operatorRegistry as any,
      {} as any,
      {
        getByFingerprintsPaginated: async (_fingerprints, _size, onBatch) =>
          onBatch(relays, 1, 1)
      } as any
    )

    return service.verifyRelays(
      relays.map(({ fingerprint }: { fingerprint: string }) => fingerprint)
    )
  }

  it('records accepted relays as OK', async () => {
    const results = await verify(
      [relay(fingerprint('A')), relay(fingerprint('B')), relay(fingerprint('D'))],
      true
    )

    expect(results).toEqual([
      { fingerprint: fingerprint('D'), result: 'AlreadyVerified' },
      { fingerprint: fingerprint('A'), result: 'OK' },
      { fingerprint: fingerprint('B'), result: 'OK' }
    ])
  })

  it('records refused relays as AOMessageFailed', async () => {
    const results = await verify([relay(fingerprint('A'))], false)

    expect(results).toEqual([
      { fingerprint: fingerprint('A'), result: 'AOMessageFailed' }
    ])
  })
})
