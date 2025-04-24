job "operator-registry-controller-live" {
  datacenters = ["ator-fin"]
  type = "service"

  group "operator-registry-controller-live-group" {
    count = 1

    volume "geo-ip-db" {
      type      = "host"
      read_only = false
      source    = "geo-ip-db"
    }

    network {
      mode = "bridge"
      port "operator-registry-controller-port" {
        to = 3000
        host_network = "wireguard"
      }
      port "redis" {
        host_network = "wireguard"
      }
    }

    task "operator-registry-controller-live-service" {
      driver = "docker"
      config {
        image = "ghcr.io/anyone-protocol/operator-registry-controller:[[.commit_sha]]"
        force_pull = true
        mount {
          type = "bind"
          target = "/etc/ssl/certs/vault-ca.crt"
          source = "/opt/nomad/tls/vault-ca.crt"
          readonly = true
          bind_options {
            propagation = "private"
          }
        }
      }

      vault {
        policies = [
          "valid-ator-live",
          "pki-hardware-token-sudoer",
          "jsonrpc-live-operator-registry-controller-eth"
        ]
      }

      template {
        data = <<-EOH
        OPERATOR_REGISTRY_PROCESS_ID="[[ consulKey "smart-contracts/live/operator-registry-address" ]]"
        RELAY_UP_NFT_CONTRACT_ADDRESS="[[ consulKey "relay-up-nft-contract/live/address" ]]"

        {{- range service "validator-live-mongo" }}
          MONGO_URI="mongodb://{{ .Address }}:{{ .Port }}/operator-registry-controller-live-testnet"
        {{- end }}

        {{- range service "operator-registry-controller-live-redis" }}
          REDIS_HOSTNAME="{{ .Address }}"
          REDIS_PORT="{{ .Port }}"
        {{- end }}

        {{- range service "onionoo-war-live" }}
          ONIONOO_DETAILS_URI="http://{{ .Address }}:{{ .Port }}/details"
        {{- end }}

        {{ with secret "kv/valid-ator/live" }}
          OPERATOR_REGISTRY_CONTROLLER_KEY="{{ .Data.data.RELAY_REGISTRY_OPERATOR_KEY }}"
          BUNDLER_CONTROLLER_KEY="{{ .Data.data.RELAY_REGISTRY_OPERATOR_KEY }}"
        {{end}}

        {{with secret "kv/vault"}}
          VAULT_ADDR="{{.Data.data.VAULT_ADDR}}"
        {{end}}

        {{ $apiKeyPrefix := "api_key_" }}
        {{ $allocIndex := env "NOMAD_ALLOC_INDEX" }}

        {{ with secret "kv/jsonrpc/live/operator-registry-controller/infura/eth" }}
          EVM_JSON_RPC="https://sepolia.infura.io/v3/{{ index .Data.data (print $apiKeyPrefix $allocIndex) }}"
          EVM_PRIMARY_WSS="wss://sepolia.infura.io/ws/v3/{{ index .Data.data (print $apiKeyPrefix $allocIndex) }}"
          EVM_MAINNET_PRIMARY_JSON_RPC="https://mainnet.infura.io/v3/{{ index .Data.data (print $apiKeyPrefix $allocIndex) }}"
          EVM_MAINNET_PRIMARY_WSS="wss://mainnet.infura.io/ws/v3/{{ index .Data.data (print $apiKeyPrefix $allocIndex) }}"
        {{ end }}
        {{ with secret "kv/jsonrpc/live/operator-registry-controller/alchemy/eth" }}
          EVM_SECONDARY_WSS="wss://eth-sepolia.g.alchemy.com/v2/{{ index .Data.data (print $apiKeyPrefix $allocIndex) }}"
          EVM_MAINNET_SECONDARY_JSON_RPC="https://eth-mainnet.g.alchemy.com/v2/{{ index .Data.data (print $apiKeyPrefix $allocIndex) }}"
          EVM_MAINNET_SECONDARY_WSS="wss://eth-mainnet.g.alchemy.com/v2/{{ index .Data.data (print $apiKeyPrefix $allocIndex) }}"
        {{ end }}
        EOH
        destination = "secrets/file.env"
        env         = true
      }

      env {
        BUMP="1"
        IS_LIVE="true"
        VERSION="[[.commit_sha]]"
        ONIONOO_REQUEST_TIMEOUT=60000
        ONIONOO_REQUEST_MAX_REDIRECTS=3
        CPU_COUNT="1"
        GEODATADIR="/geo-ip-db/data"
        GEOTMPDIR="/geo-ip-db/tmp"
        DO_CLEAN="true"
        BUNDLER_GATEWAY="https://ar.anyone.tech"
        BUNDLER_NODE="https://ar.anyone.tech/bundler"
        BUNDLER_NETWORK="ethereum"
        CU_URL="https://cu.anyone.permaweb.services"
        EVM_NETWORK="sepolia"
      }

      volume_mount {
        volume      = "geo-ip-db"
        destination = "/geo-ip-db"
        read_only   = false
      }
      
      resources {
        cpu    = 4096
        memory = 8192
      }

      service {
        name = "operator-registry-controller-live"
        port = "operator-registry-controller-port"
        tags = ["logging"]
        
        check {
          name     = "live operator-registry-controller health check"
          type     = "http"
          path     = "/health"
          interval = "5s"
          timeout  = "10s"
          check_restart {
            limit = 180
            grace = "15s"
          }
        }
      }
    }
  }
}
