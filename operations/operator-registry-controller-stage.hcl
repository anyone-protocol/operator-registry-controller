job "operator-registry-controller-stage" {
  datacenters = ["ator-fin"]
  type = "service"

  group "operator-registry-controller-stage-group" {
    
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

    task "operator-registry-controller-stage-service" {
      driver = "docker"
      config {
        image = "ghcr.io/anyone-protocol/operator-registry-controller:[[.commit_sha]]"
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
        policies = ["valid-ator-stage"]
      }

      template {
        data = <<-EOH
        OPERATOR_REGISTRY_PROCESS_ID="[[ consulKey "smart-contracts/stage/operator-registry-address" ]]"
        RELAY_UP_NFT_CONTRACT_ADDRESS="[[ consulKey "relay-up-nft-contract/stage/address" ]]"
        
        {{with secret "kv/valid-ator/stage"}}
          OPERATOR_REGISTRY_CONTROLLER_KEY="{{.Data.data.RELAY_REGISTRY_OPERATOR_KEY}}"
          
          BUNDLER_NETWORK="{{.Data.data.IRYS_NETWORK}}"
          BUNDLER_CONTROLLER_KEY="{{.Data.data.RELAY_REGISTRY_OPERATOR_KEY}}"

          EVM_NETWORK="{{.Data.data.INFURA_NETWORK}}"
          EVM_JSON_RPC="{{.Data.data.JSON_RPC}}"
          EVM_PRIMARY_WSS="{{.Data.data.INFURA_WS_URL}}"
          EVM_SECONDARY_WSS="{{.Data.data.ALCHEMY_WS_URL}}"

          EVM_MAINNET_PRIMARY_JSON_RPC="{{.Data.data.MAINNET_JSON_RPC}}"
          EVM_MAINNET_SECONDARY_JSON_RPC="{{.Data.data.MAINNET_JSON_RPC_SECONDARY}}"
          EVM_MAINNET_PRIMARY_WSS="{{.Data.data.MAINNET_WS_URL}}"
          EVM_MAINNET_SECONDARY_WSS="{{.Data.data.MAINNET_WS_URL_SECONDARY}}"
        {{end}}

        {{- range service "validator-stage-mongo" }}
          MONGO_URI="mongodb://{{ .Address }}:{{ .Port }}/operator-registry-controller-stage-testnet"
        {{- end }}

        {{- range service "operator-registry-controller-stage-redis" }}
          REDIS_HOSTNAME="{{ .Address }}"
          REDIS_PORT="{{ .Port }}"
        {{- end }}

        {{- range service "onionoo-war-live" }}
          ONIONOO_DETAILS_URI="http://{{ .Address }}:{{ .Port }}/details"
        {{- end }}
        EOH
        destination = "secrets/file.env"
        env         = true
      }

      env {
        BUMP="acl-redeploy-2"
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
        name = "operator-registry-controller-stage"
        port = "operator-registry-controller-port"
        tags = ["logging"]
        
        check {
          name     = "Stage operator-registry-controller health check"
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
