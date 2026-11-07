import { VerificationService } from './verification.service'

const fingerprint = (character: string) => character.repeat(40)

const hardwareRelay = (relayFingerprint: string, serNums: unknown) => ({
  fingerprint: relayFingerprint,
  any1_address: '0x0000000000000000000000000000000000000001',
  hardware_info: {
    id: 'id',
    company: 'company',
    format: 'format',
    wallet: 'wallet',
    fingerprint: relayFingerprint,
    nftid: '0',
    build: 'build',
    flags: 'flags',
    serNums,
    pubKeys: [],
    certs: []
  }
})

describe('VerificationService hardware checks', () => {
  let hardwareVerificationService: {
    getVerifiedHardwareByAtecSerial: jest.Mock
    isHardwareProofValid: jest.Mock
  }

  beforeEach(() => {
    hardwareVerificationService = {
      getVerifiedHardwareByAtecSerial: jest.fn(async (atecSerial: string) => {
        atecSerial.toLowerCase()
        return null
      }),
      isHardwareProofValid: jest.fn(async (relay: { fingerprint: string }) => {
        if (relay.fingerprint === fingerprint('B')) {
          throw new Error('hardware check error')
        }
        return true
      })
    }
  })

  const checkRelays = (relays: object[], verified: string[] = []) => {
    const service = new VerificationService(
      { get: () => 'false' } as any,
      {} as any,
      hardwareVerificationService as any,
      {} as any,
      {} as any,
      {
        getByFingerprintsPaginated: async (_fingerprints, _size, onBatch) =>
          onBatch(relays, 1, 1)
      } as any
    )

    return (service as any).getRelaysToAddAsClaimable(
      [],
      verified,
      {},
      relays.map(({ fingerprint }: { fingerprint: string }) => fingerprint)
    )
  }

  it('fails hardware relays without a usable ATEC serial and does not look them up', async () => {
    const { relaysToAddAsClaimable, results } = await checkRelays([
      hardwareRelay(fingerprint('A'), [{ type: 'DEVICE', number: '01' }]),
      hardwareRelay(fingerprint('E'), { a: { type: 'ATEC', number: '04' } }),
      hardwareRelay(fingerprint('F'), [null, { type: 'ATEC', number: 5 }]),
      hardwareRelay(fingerprint('C'), [{ type: 'ATEC', number: '02' }])
    ])

    expect(results).toEqual([
      { fingerprint: fingerprint('A'), result: 'HardwareProofFailed' },
      { fingerprint: fingerprint('E'), result: 'HardwareProofFailed' },
      { fingerprint: fingerprint('F'), result: 'HardwareProofFailed' }
    ])
    expect(
      relaysToAddAsClaimable.map(({ relay }) => relay.fingerprint)
    ).toEqual([fingerprint('C')])
    expect(
      hardwareVerificationService.getVerifiedHardwareByAtecSerial
    ).toHaveBeenCalledTimes(1)
  })

  it('fails only the relay whose hardware check throws and finishes the run', async () => {
    const { relaysToAddAsClaimable, results } = await checkRelays(
      [
        hardwareRelay(fingerprint('B'), [{ type: 'ATEC', number: '03' }]),
        hardwareRelay(fingerprint('C'), [{ type: 'ATEC', number: '02' }]),
        { fingerprint: fingerprint('D'), any1_address: '0x0000000000000000000000000000000000000002' }
      ],
      [fingerprint('D')]
    )

    expect(results).toEqual([
      { fingerprint: fingerprint('B'), result: 'HardwareProofFailed' },
      { fingerprint: fingerprint('D'), result: 'AlreadyVerified' }
    ])
    expect(
      relaysToAddAsClaimable.map(({ relay }) => relay.fingerprint)
    ).toEqual([fingerprint('C')])
  })
})
