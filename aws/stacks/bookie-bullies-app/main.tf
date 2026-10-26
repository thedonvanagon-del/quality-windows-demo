# One small Lightsail server runs the Bookie Bullies app: Node serves it on
# localhost, Caddy in front gets and renews the https certificate. The app's
# SQLite database lives on the server's disk, which daily snapshots back up.
# The existing www.bookiebullies.com site (S3 + CloudFront) is not touched.

locals {
  name = "bookie-bullies-app"
  tags = {
    Project = "bookie-bullies-app"
    Owner   = "buddha-beans"
  }
}

resource "aws_lightsail_key_pair" "deploy" {
  name       = "${local.name}-deploy"
  public_key = var.deploy_public_key
}

resource "aws_lightsail_instance" "app" {
  name              = local.name
  availability_zone = var.availability_zone
  blueprint_id      = "ubuntu_24_04"
  bundle_id         = var.bundle_id
  key_pair_name     = aws_lightsail_key_pair.deploy.name
  user_data         = templatefile("${path.module}/setup.sh.tftpl", { domain = var.domain_name })

  # A snapshot every night. Losing the database file loses every account and record.
  add_on {
    type          = "AutoSnapshot"
    snapshot_time = "09:00" # UTC, early morning in the US, after the last games grade
    status        = "Enabled"
  }

  tags = local.tags

  lifecycle {
    # The setup script only runs on first boot; editing it later must not
    # replace the server (and its database).
    ignore_changes = [user_data]
  }
}

resource "aws_lightsail_static_ip" "app" {
  name = "${local.name}-ip"
}

resource "aws_lightsail_static_ip_attachment" "app" {
  static_ip_name = aws_lightsail_static_ip.app.name
  instance_name  = aws_lightsail_instance.app.name
}

# Only web traffic and SSH get in.
resource "aws_lightsail_instance_public_ports" "app" {
  instance_name = aws_lightsail_instance.app.name

  port_info {
    protocol  = "tcp"
    from_port = 80
    to_port   = 80
  }

  port_info {
    protocol  = "tcp"
    from_port = 443
    to_port   = 443
  }

  port_info {
    protocol  = "tcp"
    from_port = 22
    to_port   = 22
  }
}

resource "aws_route53_record" "app" {
  count   = var.route53_zone_id == null ? 0 : 1
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"
  ttl     = 300
  records = [aws_lightsail_static_ip.app.ip_address]
}
