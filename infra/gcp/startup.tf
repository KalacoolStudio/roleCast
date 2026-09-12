locals {
  startup_files = [
    {
      path    = "/var/lib/rolecast/host.sh", mode = "0755"
      content = file("${path.module}/../../scripts/gcp/host.sh")
    },
    {
      path    = "/var/lib/rolecast/config.json", mode = "0600"
      content = jsonencode(local.runtime_config)
    },
    {
      path    = "/var/lib/rolecast/settings", mode = "0600"
      content = <<-CONFIG
        DATA_DEVICE='/dev/disk/by-id/google-rolecast-data'
        IMAGE_REPOSITORY='${local.image_repository}'
        BACKUP_BUCKET='${google_storage_bucket.backups.name}'
        INITIALIZE_DATA_DISK=${var.initialize_data_disk}
      CONFIG
    },
    {
      path    = "/etc/systemd/system/rolecast-prepare.service", mode = "0644"
      content = <<-UNIT
        [Unit]
        Description=Prepare Role Cast persistent data disk
        Requires=docker.service
        After=network-online.target docker.service
        Wants=network-online.target

        [Service]
        Type=oneshot
        RemainAfterExit=yes
        ExecStart=/bin/bash /var/lib/rolecast/host.sh prepare
        TimeoutStartSec=120
      UNIT
    },
    {
      path    = "/etc/systemd/system/rolecast.service", mode = "0644"
      content = <<-UNIT
        [Unit]
        Description=Role Cast frontend and API
        Requires=rolecast-prepare.service
        After=rolecast-prepare.service network-online.target docker.service
        StartLimitIntervalSec=120
        StartLimitBurst=5

        [Service]
        Type=simple
        ExecStart=/bin/bash /var/lib/rolecast/host.sh run
        ExecStop=-/usr/bin/docker stop --time 30 rolecast
        ExecStopPost=/bin/bash /var/lib/rolecast/host.sh cleanup
        Restart=on-failure
        RestartSec=5
        TimeoutStopSec=45

        [Install]
        WantedBy=multi-user.target
      UNIT
    },
    {
      path    = "/etc/systemd/system/rolecast-backup.service", mode = "0644"
      content = <<-UNIT
        [Unit]
        Description=Back up Role Cast SQLite to private Cloud Storage
        Requires=rolecast-prepare.service
        After=rolecast-prepare.service network-online.target docker.service

        [Service]
        Type=oneshot
        ExecStart=/bin/bash /var/lib/rolecast/host.sh backup
        TimeoutStartSec=600
      UNIT
    },
    {
      path    = "/etc/systemd/system/rolecast-backup.timer", mode = "0644"
      content = <<-UNIT
        [Unit]
        Description=Daily Role Cast database backup

        [Timer]
        OnCalendar=*-*-* 03:00:00 UTC
        Persistent=true
        Unit=rolecast-backup.service

        [Install]
        WantedBy=timers.target
      UNIT
    }
  ]
  # Startup scripts recreate /etc units on every COS boot. No deprecated container metadata.
  startup_script = join("\n", concat([
    "#!/usr/bin/env bash", "set -euo pipefail", "umask 077",
    "install -d -m 0700 /var/lib/rolecast"
    ], flatten([for f in local.startup_files : [
      "printf '%s' '${base64encode(f.content)}' | base64 --decode > '${f.path}.new'",
      "chmod ${f.mode} '${f.path}.new'",
      "mv -f '${f.path}.new' '${f.path}'"
    ]]), [
    "systemctl daemon-reload",
    "systemctl enable rolecast.service rolecast-backup.timer",
    "systemctl start --no-block rolecast.service",
    "systemctl start rolecast-backup.timer", ""
  ]))
}
