# Operator Registry Controller

An oracle service for the [ANYONE Protocol](https://anyone.io) that links Tor
relay operators to their on-chain identity and registers them with the
**Operator Registry** [AO](https://ao.arweave.dev) process (smart contract).

The controller continuously discovers ANYONE relays, validates that each one is
claimed by an operator's EVM address, verifies operator hardware, and submits
operator certificates to the Operator Registry process so that operators can
claim their relays and earn rewards. It also publishes relay/validation metrics
to Arweave for permanent, public record.

## How it works

Relay operators advertise their ANYONE (EVM) address in their relay's
`contact` field using the pattern `@anon:<0x-evm-address>`. The controller polls
[Onionoo](https://metrics.torproject.org/onionoo.html) relay details, finds
these relays, runs them through validation and verification, and registers the
valid ones on-chain.

Work runs as a chain of [BullMQ](https://docs.bullmq.io/) flows, triggered
immediately on startup and re-queued on a **1-hour** interval. Only the elected
cluster leader (see [Clustering](#clustering)) enqueues and processes the
pipeline.

### Pipeline

```
tasks-queue: validate ──► validation-flow ──► tasks-queue: verify ──► verification-flow
```

1. **fetch-relays** (`validation-queue`)
   - Fetches relay details from `ONIONOO_DETAILS_URI`.
   - Keeps only relays whose `contact` contains the `@anon:` pattern with a
     valid EVM address, and that are not in `BANNED_FINGERPRINTS`.
   - Resolves each relay's geolocation to an [H3](https://h3geo.org/) cell
     (resolution 4) using fingerprint→coordinate data from the ANYONE API.
   - Upserts the relay data into MongoDB (transient working storage) and returns
     the matching fingerprints.

2. **validate-relays** (`validation-queue`)
   - Re-reads relays in batches, extracts and validates the operator's EVM
     address (`any1_address`) from the `contact` string (checksummed via
     `ethers`), and stores it back on the relay record.

3. **verify-relays** (`verification-queue`)
   - Reads the current Operator Registry state from the AO process
     (`View-State`) to skip already-claimable / already-verified relays.
   - For each new relay, runs [hardware verification](#hardware-verification)
     where applicable, then submits valid relays in chunks of 100 via the
     `Admin-Submit-Operator-Certificates` AO message.

4. **confirm-verification** / **persist-verification** (`verification-queue`)
   - Aggregates per-relay results, computes validation stats and an H3
     hex-map of relay coverage, and uploads them to Arweave via the
     [ArDrive Turbo](https://docs.ardrive.io/) bundler.
   - Persists a `VerificationData` record to MongoDB and cleans up the transient
     relay records.
   - If the stats upload fails, a `recover-persist-verification` job retries the
     upload up to 3 times.

### Hardware verification

Some relays run on dedicated ANYONE hardware and submit a `hardware_info` proof.
The controller verifies these against:

- **RELAYUP NFT ownership** — confirms the operator address owns the claimed NFT
  ID on the `RELAY_UP_NFT_CONTRACT_ADDRESS` contract (with a backup RPC
  provider for resilience).
- **Known-device serial proofs** — verifies a secp256r1 (P-256) signature over
  the device's node ID / serials / fingerprint / address for devices imported
  into the `known_devices` collection.

Each unique device (by ATEC serial) can only be verified once. Verified hardware
is recorded in MongoDB, and failures are stored for diagnostics. Successfully
hardware-verified relays are submitted to the Operator Registry smart-contract with `hw: true` flag.

Device-certificate verification (validating a device cert against a Vault PKI issuer) is also available.

### External dependencies

| Dependency | Purpose |
| --- | --- |
| **MongoDB** | Transient relay working storage + verification/hardware records |
| **Redis** | Backing store for BullMQ queues (standalone or Sentinel) |
| **Consul** | Distributed leader election across instances |
| **Vault** | PKI issuer lookup for device-certificate verification |
| **Onionoo** | Source of Tor/ANYONE relay details |
| **ANYONE API** | Fingerprint → geolocation map (`/fingerprint-map`) |
| **EVM RPC** | RELAYUP NFT ownership checks (primary + backup providers) |
| **AO** (aoconnect) | Reads/writes the Operator Registry process |
| **ArDrive Turbo** | Bundles and uploads metrics/stats to Arweave |

## Project structure

```
src/
  main.ts                  App bootstrap (Nest + Winston logging)
  app.module.ts            Root module: Mongo, BullMQ/Redis, schedule wiring
  cluster/                 Consul leader election + multi-thread workers
  tasks/                   BullMQ queues, flows, and processors (pipeline orchestration)
  validation/              Onionoo fetch, relay filtering, EVM-address extraction
  verification/            Operator registry diff, hardware verification, persistence
  operator-registry/       AO process client (View-State, submit certificates)
  hardware-verification/   (within verification/) NFT + serial-proof checks
  bundling/                ArDrive Turbo uploads to Arweave
  geo-ip/                  Fingerprint → H3 cell lookups via ANYONE API
  evm-provider/            Resilient EVM JSON-RPC providers
  vault/                   Vault PKI issuer lookups
  util/                    AO messaging, signing, arbundles-lite, helpers
operations/                Nomad job specs (stage/live + Redis Sentinel)
```

## Local development

### Prerequisites

- Node.js (LTS) and npm
- Reachable MongoDB and Redis instances (point `MONGO_URI` / Redis vars at them)
- A `.env` file (loaded automatically via `@nestjs/config`)

When `IS_LIVE` is not `'true'`, the service runs in single-node mode (no Consul
required), obliterates the queues on startup, and skips all on-chain writes and
Arweave uploads — making it safe for local runs.

### Setup

```bash
npm install
```

### Run

```bash
npm run start        # development
npm run start:dev    # watch mode
npm run start:prod   # production (runs dist/main)
```

### Test

```bash
npm run test         # unit tests
npm run test:e2e     # e2e tests
npm run test:cov     # coverage
```

### Lint & format

```bash
npm run lint
npm run format
```

## Configuration

All configuration is provided via environment variables.

### Core / runtime

| Variable | Required | Description |
| --- | --- | --- |
| `IS_LIVE` | yes | `'true'` enables on-chain writes, Arweave uploads, and Consul clustering. Anything else runs in safe single-node mode and clears queues on startup. |
| `DO_CLEAN` | no | `'true'` obliterates all queues on startup (leader only). |
| `PORT` | no | HTTP listen port (default `3000`). |
| `CPU_COUNT` | no | Number of worker threads to fork (capped at host CPU count). |
| `IS_LOCAL_LEADER` | internal | Set per-worker by the clustering layer; do not set manually. |

### MongoDB

| Variable | Required | Description |
| --- | --- | --- |
| `MONGO_URI` | yes | MongoDB connection string. |

### Redis / BullMQ

| Variable | Required | Description |
| --- | --- | --- |
| `REDIS_MODE` | no | `standalone` (default) or `sentinel`. |
| `REDIS_HOSTNAME` | standalone | Redis host. |
| `REDIS_PORT` | standalone | Redis port. |
| `REDIS_MASTER_NAME` | sentinel | Sentinel master name. |
| `REDIS_SENTINEL_1_HOST` / `_PORT` | sentinel | Sentinel node 1. |
| `REDIS_SENTINEL_2_HOST` / `_PORT` | sentinel | Sentinel node 2. |
| `REDIS_SENTINEL_3_HOST` / `_PORT` | sentinel | Sentinel node 3. |

### Clustering (Consul)

| Variable | Required | Description |
| --- | --- | --- |
| `CONSUL_HOST` | live | Consul host. If unset, the service runs single-node. |
| `CONSUL_PORT` | live | Consul port. |
| `CONSUL_SERVICE_NAME` | live | Service name used for the leader-election KV key. |
| `CONSUL_TOKEN_CONTROLLER_CLUSTER` | live | Consul ACL token. |

### Relay source (Onionoo)

| Variable | Required | Description |
| --- | --- | --- |
| `ONIONOO_DETAILS_URI` | yes | URL of the Onionoo relay-details endpoint. |
| `DETAILS_URI_AUTH` | no | `Authorization` header value for the details endpoint. |
| `ONIONOO_REQUEST_TIMEOUT` | no | HTTP request timeout. |
| `ONIONOO_REQUEST_MAX_REDIRECTS` | no | Max HTTP redirects. |
| `BANNED_FINGERPRINTS` | no | Comma-separated relay fingerprints to exclude. |

### Geolocation (ANYONE API)

| Variable | Required | Description |
| --- | --- | --- |
| `ANYONE_API_URL` | yes | Base URL of the ANYONE API; `/fingerprint-map` is appended. |
| `ANYONE_API_CACHE_TTL` | no | Cache TTL in ms for the fingerprint map (default 1h). |

### Operator Registry (AO)

| Variable | Required | Description |
| --- | --- | --- |
| `OPERATOR_REGISTRY_PROCESS_ID` | yes | AO process ID of the Operator Registry. |
| `OPERATOR_REGISTRY_CONTROLLER_KEY` | yes | EVM private key used to sign AO messages. **Secret.** |
| `CU_URL` | live | AO Compute Unit URL. |
| `GATEWAY_URL` | live | Arweave gateway URL for AO. |
| `GRAPHQL_URL` | live | Arweave GraphQL URL for AO. |

### Hardware verification (EVM + Vault)

| Variable | Required | Description |
| --- | --- | --- |
| `RELAY_UP_NFT_CONTRACT_ADDRESS` | yes | RELAYUP NFT contract address. |
| `EVM_MAINNET_PRIMARY_JSON_RPC` | yes | Primary EVM JSON-RPC endpoint. |
| `EVM_MAINNET_SECONDARY_JSON_RPC` | yes | Backup EVM JSON-RPC endpoint. |
| `VAULT_ADDR` | no | Vault address (PKI issuer lookups). |
| `VAULT_TOKEN` | no | Vault token. |
| `VAULT_TOKEN_PERIOD` | no | Vault token period (default `4h`). |
| `VAULT_TOKEN_POLICIES` | no | Comma-separated Vault policies (default `pki-hardware-reader`). |

### Bundling (ArDrive Turbo / Arweave)

| Variable | Required | Description |
| --- | --- | --- |
| `BUNDLER_CONTROLLER_KEY` | yes | EVM private key used to sign bundled uploads. **Secret.** |
| `BUNDLER_NODE` | yes | Turbo upload-service URL. |
| `BUNDLER_GATEWAY` | yes | Arweave gateway URL. |
| `BUNDLER_NETWORK` | yes | Bundler network identifier. |

## Clustering

In live mode the service forks one worker per `CPU_COUNT` and uses Consul to
elect a single cross-instance leader. Only the leader enqueues the immediate
startup job and the recurring 1-hour validation. Leadership is held via a Consul
session (15s TTL, renewed every 10s) over the KV key
`clusters/<CONSUL_SERVICE_NAME>/leader`; if the leader dies, its session is
deleted and another instance acquires the lock. When Consul is unavailable or
the service is not live, it runs as a single-node leader.

## Deployment

The service is built into a container image (see [`Dockerfile`](Dockerfile)) by
the GitHub Actions workflow in
[`.github/workflows/build-and-publish-image.yml`](.github/workflows/build-and-publish-image.yml),
and deployed on a **HashiCorp Nomad** stack alongside Consul and Vault.

Nomad job specifications live in [`operations/`](operations/):

| File | Purpose |
| --- | --- |
| `operator-registry-controller-stage.hcl` | Staging deployment |
| `operator-registry-controller-live.hcl` | Production deployment |
| `operator-registry-controller-redis-sentinel-stage.hcl` | Staging Redis Sentinel |
| `operator-registry-controller-redis-sentinel-live.hcl` | Production Redis Sentinel |

These job specs source secrets (controller keys, Consul/Vault tokens, RPC API
keys) from Vault and inject the environment variables documented above.

## License

[AGPL-3.0-only](LICENSE)
</content>
</invoke>
