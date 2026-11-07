jest.mock('../geo-ip/geo-ip.service', () => ({ GeoIpService: class {} }))
jest.mock('./relay-info.service', () => ({ RelayInfoService: class {} }))

import { Logger } from '@nestjs/common'
import { of, throwError } from 'rxjs'
import { ValidationService } from './validation.service'
import { ValidationQueue } from '../tasks/processors/validation-queue'

function build(response: () => any) {
  const settings = { ONIONOO_DETAILS_URI: 'http://onionoo.test/details' }
  const config = { get: (key: string) => settings[key] }
  const http = { get: jest.fn(response) }
  const relayInfo = { upsertMany: jest.fn(async () => []) }
  const geoip = { resolve: jest.fn(async () => undefined) }
  const service = new ValidationService(http as any, config as any, geoip as any, relayInfo as any)
  return { service, relayInfo }
}

describe('ValidationService onionoo guard', () => {
  let errors: jest.SpyInstance

  beforeEach(() => {
    errors = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined)
  })

  afterEach(() => jest.restoreAllMocks())

  const alarmed = (name: string) =>
    errors.mock.calls.some(([message]) => String(message).includes(`[alarm=${name}]`))

  it('raises an alarm when the onionoo request fails', async () => {
    const { service } = build(() => throwError(() => new Error('socket hang up')))

    await expect(service.fetchNewRelays()).rejects.toThrow('Onionoo fetch failed')
    expect(alarmed('onionoo-fetch-failed')).toBe(true)
  })

  it('treats an empty relay list as a failed fetch', async () => {
    const { service } = build(() => of({ status: 200, data: { relays: [] }, headers: {} }))

    await expect(service.fetchNewRelays()).rejects.toThrow('Onionoo fetch failed')
    expect(alarmed('onionoo-fetch-failed')).toBe(true)
  })

  it('returns the relay list and records last-modified', async () => {
    const relays = [{ fingerprint: 'A'.repeat(40) }]
    const lastModified = 'Sat, 07 Nov 2026 22:00:00 GMT'
    const { service } = build(() => of({ status: 200, data: { relays }, headers: { 'last-modified': lastModified } }))

    await expect(service.fetchNewRelays()).resolves.toEqual(relays)
    expect((service as any).lastSeen).toBe(lastModified)
    expect(errors).not.toHaveBeenCalledWith(expect.stringContaining('[alarm='))
  })

  it('leaves the validation cycle with nothing to verify when the fetch fails', async () => {
    const { service, relayInfo } = build(() => throwError(() => new Error('socket hang up')))
    const queue = new ValidationQueue(service)

    await expect(queue.process({ name: ValidationQueue.JOB_FETCH_RELAYS, id: '1' } as any)).resolves.toEqual([])
    expect(relayInfo.upsertMany).not.toHaveBeenCalled()
  })
})
