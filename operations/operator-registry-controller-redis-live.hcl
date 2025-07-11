job "operator-registry-controller-redis-live" {
  datacenters = ["ator-fin"]
  type = "service"
  namespace = "live-protocol"
  
  constraint {
    attribute = "${meta.pool}"
    value = "live-protocol"
  }

  group "operator-registry-controller-redis-live-group" {
    count = 1

    network {
      mode = "bridge"
      port "redis" {
        host_network = "wireguard"
      }
    }

    service {
      name = "operator-registry-controller-redis-live"
      port = "redis"
      tags = ["logging"]
      check {
        name     = "operator registry controller live redis health check"
        type     = "tcp"
        interval = "5s"
        timeout  = "10s"
        address_mode = "alloc"
      }
    }

    task "operator-registry-controller-redis-live" {
      driver = "docker"
      config {
        image = "redis:7.2"
        args = ["/usr/local/etc/redis/redis.conf"]
        volumes = [
          "local/redis.conf:/usr/local/etc/redis/redis.conf"
        ]
      }

      resources {
        cpu    = 4096
        memory = 8192
      }

      template {
        data = <<-EOH
        # Based on https://raw.githubusercontent.com/redis/redis/7.2/redis.conf
        bind 0.0.0.0
        port {{ env "NOMAD_PORT_redis" }}
        protected-mode no
        tcp-backlog 511
        timeout 0
        tcp-keepalive 300
        daemonize no
        pidfile /tmp/redis_6379.pid
        loglevel notice
        logfile ""
        databases 16
        always-show-logo no
        set-proc-title yes
        proc-title-template "{title} {listen-addr} {server-mode}"
        locale-collate ""
        stop-writes-on-bgsave-error yes
        rdbcompression yes
        rdbchecksum yes
        dbfilename dump.rdb
        rdb-del-sync-files no
        dir ./
        replica-serve-stale-data yes
        replica-read-only yes
        repl-diskless-sync yes
        repl-diskless-sync-delay 5
        repl-diskless-sync-max-replicas 0
        repl-diskless-load disabled
        repl-disable-tcp-nodelay no
        replica-priority 100
        acllog-max-len 128
        lazyfree-lazy-eviction no
        lazyfree-lazy-expire no
        lazyfree-lazy-server-del no
        replica-lazy-flush no
        lazyfree-lazy-user-del no
        lazyfree-lazy-user-flush no
        oom-score-adj no
        oom-score-adj-values 0 200 800
        disable-thp yes
        appendonly yes
        appendfilename "appendonly.aof"
        appenddirname "appendonlydir"
        appendfsync everysec
        no-appendfsync-on-rewrite no
        auto-aof-rewrite-percentage 100
        auto-aof-rewrite-min-size 64mb
        aof-load-truncated yes
        aof-use-rdb-preamble yes
        aof-timestamp-enabled no
        slowlog-log-slower-than 10000
        slowlog-max-len 128
        latency-monitor-threshold 0
        notify-keyspace-events ""
        hash-max-listpack-entries 512
        hash-max-listpack-value 64
        list-max-listpack-size -2
        list-compress-depth 0
        set-max-intset-entries 512
        set-max-listpack-entries 128
        set-max-listpack-value 64
        zset-max-listpack-entries 128
        zset-max-listpack-value 64
        hll-sparse-max-bytes 3000
        stream-node-max-bytes 4096
        stream-node-max-entries 100
        activerehashing yes
        client-output-buffer-limit normal 0 0 0
        client-output-buffer-limit replica 256mb 64mb 60
        client-output-buffer-limit pubsub 32mb 8mb 60
        hz 10
        dynamic-hz yes
        aof-rewrite-incremental-fsync yes
        rdb-save-incremental-fsync yes
        jemalloc-bg-thread yes
        EOH
        destination = "local/redis.conf"
        env         = false
      }
    }
  }
}
