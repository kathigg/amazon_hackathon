# Production redeploy: push code + replace the database

Two operations, in order:

1. Ship the current `main` (or whichever branch you're on) to ECS so the live container runs the latest code and the latest Prisma schema.
2. Wipe production's Postgres and restore it from the local `civic-mirror-db` container.

The second step is **destructive** — production loses every row written since the mirror was last hydrated. Do not run it without a fresh prod snapshot in hand (step 2.1 below).

S3/CloudFront image-pool setup is covered in **§3** below. It runs once after §1, populates the prod `BillImageAsset` table from the local mirror, and wires `IMAGE_S3_BUCKET` / `IMAGE_CDN_HOST` on the ECS task definition. Bills fall back to the legacy `Bill.imageUrl` path between §1 and §3, so the order is non-blocking — you can ship code without images and add images later.

> Prerequisite reading: skim [`AWS_ONBOARDING.md`](./AWS_ONBOARDING.md) (named resources, deploy basics) and [`AWS_LOCAL_DB_MIRROR.md`](./AWS_LOCAL_DB_MIRROR.md) (this doc is its reverse).

---

## Prerequisites

- AWS CLI v2 authenticated to account `712589718735` in `us-east-1`. Confirm:
  ```bash
  aws sts get-caller-identity
  ```
- Docker with buildx (needed for `--platform linux/amd64` cross-build from non-x86 hosts).
- `jq`.
- Running `civic-mirror-db` container holding the data you want to push (check: `docker ps | grep civic-mirror-db`). If its data is stale or synthetic, refresh it via `AWS_LOCAL_DB_MIRROR.md` first.

---

## What's in the code that prod doesn't have yet

Quick punch list from the recent commits — read before deploying so you know what to expect after rollout:

- **Schema:** new `Bill` columns (`progressStage`, `stageReachedAt`, `latestActionText`, `lastSyncedAt`, `legislativeSubjects`, `imageAssetId`, generated `search_vector` tsvector) + a new `BillImageAsset` table + new indexes. `prisma db push` is required.
- **Postgres FTS:** the `search_vector` column is populated by a trigger defined in `civic-connect/prisma/sql/bill_search_vector.sql` and is **not** created by `prisma db push`. `npm run setup:search` applies it.
- **Bedrock structured output:** `lib/bedrock-structured.ts` now has a native-output path for Claude 4.5+ alongside the existing tool-use coercion. No env change needed; the dispatcher is family-prefix based.
- **Bill ingestion:** the date-corruption guard refuses placeholder `now()` fallbacks; `progressStage` is computed on ingest from Congress.gov action/summary feeds. Run `npm run backfill:progress` once after schema push if you skip the DB replace step.
- **Image pool:** code reads from `BillImageAsset` first and falls back to legacy `Bill.imageUrl` if no asset is assigned. Safe to deploy without seeding the pool.

---

## 1. Push code to production

### 1.1 Identify what's currently live

So you know what you're replacing — and so you can roll back if needed.

```bash
TASK_DEF=$(aws ecs describe-services --cluster default --services civic-connect-web \
  --region us-east-1 --query 'services[0].deployments[0].taskDefinition' --output text)
CURRENT_IMAGE=$(aws ecs describe-task-definition --task-definition "$TASK_DEF" --region us-east-1 \
  --query 'taskDefinition.containerDefinitions[0].image' --output text)
echo "Currently live: $CURRENT_IMAGE"
```

Tag format is `<branch>-<short-sha>-<YYYYMMDD>-<HHMMSS>`. Record `$CURRENT_IMAGE` — it's your rollback target.

### 1.2 Build, tag, push

Run from `civic-connect/`. The tag mirrors the format above:

```bash
cd civic-connect
BRANCH=$(git rev-parse --abbrev-ref HEAD)
SHA=$(git rev-parse --short HEAD)
STAMP=$(date -u +%Y%m%d-%H%M%S)
TAG="${BRANCH}-${SHA}-${STAMP}"
REGISTRY=712589718735.dkr.ecr.us-east-1.amazonaws.com
IMAGE="${REGISTRY}/civic-connect-web:${TAG}"

# Make sure local builds before you ship — Dockerfile re-runs this, but failing
# fast here costs you a few minutes instead of a full image build.
npm run build

aws ecr get-login-password --region us-east-1 \
  | docker login --username AWS --password-stdin "$REGISTRY"

docker build --platform linux/amd64 -t "$IMAGE" .
docker push "$IMAGE"
echo "Pushed: $IMAGE"
```

The Dockerfile copies `prisma/`, `scripts/`, and `lib/` into the runtime layer, so the new schema, the FTS SQL, and the backfill scripts all ship with the image. The container's `CMD` is just `node server.js` — no migrations run on boot.

### 1.3 Apply the new schema before the rollout

Schema changes are additive (new columns + new table), so the old image will keep running fine against the new schema while the rollout proceeds. Doing it in this order avoids a window where the new image is up but the schema isn't.

Use a temporary bastion (same pattern as `AWS_LOCAL_DB_MIRROR.md` §1, copied below for self-containment) — Aurora and the proxy are in private subnets, so your laptop can't reach either directly.

```bash
REGION=us-east-1
VPC=vpc-030c3351cde833081
SUBNET=subnet-0319d4701aa5bc165
PROXY_HOST=civic-connect-rds-proxy.proxy-cafmci864cud.us-east-1.rds.amazonaws.com
PROXY_SG=sg-01948f5296135da4c
APP_SECRET_ARN=arn:aws:secretsmanager:us-east-1:712589718735:secret:civic-connect/rds/app-db-user-TRjblt
DB_NAME=neondb

STAMP=$(date -u +%Y%m%d-%H%M%S)
ROLE=civic-redeploy-tmp-$STAMP
AMI=$(aws ec2 describe-images --region $REGION --owners amazon \
  --filters 'Name=name,Values=al2023-ami-2023.*-arm64' Name=state,Values=available \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' --output text)

# --- IAM role: SSM core + read app-user secret (this stage doesn't need owner) ---
aws iam create-role --role-name "$ROLE" \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name "$ROLE" \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam put-role-policy --role-name "$ROLE" --policy-name dbmigrate --policy-document "$(cat <<EOF
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["secretsmanager:GetSecretValue"],"Resource":"${APP_SECRET_ARN}"}
]}
EOF
)"
aws iam create-instance-profile --instance-profile-name "$ROLE"
aws iam add-role-to-instance-profile --instance-profile-name "$ROLE" --role-name "$ROLE"
sleep 8

# --- Bastion SG + ingress on the proxy ---
SG=$(aws ec2 create-security-group --group-name "$ROLE" --description tmp \
       --vpc-id "$VPC" --query GroupId --output text)
RULE=$(aws ec2 authorize-security-group-ingress --group-id "$PROXY_SG" \
        --ip-permissions "IpProtocol=tcp,FromPort=5432,ToPort=5432,UserIdGroupPairs=[{GroupId=$SG}]" \
        --query 'SecurityGroupRules[0].SecurityGroupRuleId' --output text)

# --- Launch bastion ---
INSTANCE=$(aws ec2 run-instances --image-id "$AMI" --instance-type t4g.small \
  --subnet-id "$SUBNET" --security-group-ids "$SG" \
  --iam-instance-profile "Name=$ROLE" \
  --metadata-options HttpTokens=required,HttpEndpoint=enabled \
  --query 'Instances[0].InstanceId' --output text)
aws ec2 wait instance-running --instance-ids "$INSTANCE"
until [ "$(aws ssm describe-instance-information --filters Key=InstanceIds,Values=$INSTANCE \
            --query 'InstanceInformationList[0].PingStatus' --output text)" = Online ]; do sleep 5; done
```

Hold onto `$INSTANCE`, `$SG`, `$RULE`, `$ROLE`, `$STAMP` — the same bastion is reused in step 2.

Now ship the repo to the bastion (just the parts we need — `prisma/`, `package*.json`, and the FTS SQL is inside `prisma/sql/`):

```bash
tar czf /tmp/civic-prisma.tgz -C civic-connect prisma package.json package-lock.json

cat > /tmp/upload.sh <<'EOSH'
mkdir -p /opt/civic && cd /opt/civic && tar xzf /tmp/civic-prisma.tgz
EOSH

# Push the tarball via SSM. `aws ssm send-command` doesn't support file upload,
# so we base64 the tarball into the script. For a ~50KB prisma payload this is fine.
B64=$(base64 -w0 /tmp/civic-prisma.tgz)
cat > /tmp/apply-schema.sh <<EOSH
set -euo pipefail
exec > /tmp/migrate.log 2>&1

# Install Node 20 + Postgres client.
dnf -y install -q nodejs20 postgresql17 jq tar
ln -sf /usr/bin/node-20 /usr/local/bin/node || true

mkdir -p /opt/civic && cd /opt/civic
echo "$B64" | base64 -d > /tmp/civic-prisma.tgz
tar xzf /tmp/civic-prisma.tgz

# Inject DATABASE_URL from the app-user secret.
SECRET=\$(aws secretsmanager get-secret-value --region $REGION --secret-id "$APP_SECRET_ARN" --query SecretString --output text)
PGUSER=\$(echo "\$SECRET" | jq -r .username)
PGPASS=\$(echo "\$SECRET" | jq -r .password)
export DATABASE_URL="postgresql://\${PGUSER}:\${PGPASS}@$PROXY_HOST:5432/$DB_NAME?schema=public&sslmode=require"

cd /opt/civic
npm install --no-audit --no-fund --silent prisma@5.22.0
npx prisma db push --skip-generate --accept-data-loss
# Apply the FTS column + trigger. Idempotent (uses IF NOT EXISTS / CREATE OR REPLACE).
npx prisma db execute --file prisma/sql/bill_search_vector.sql --schema prisma/schema.prisma
EOSH

jq -Rs '{commands:[.]}' < /tmp/apply-schema.sh > /tmp/apply-schema-params.json
CMD=$(aws ssm send-command --instance-ids "$INSTANCE" \
  --document-name AWS-RunShellScript \
  --parameters file:///tmp/apply-schema-params.json \
  --query Command.CommandId --output text)
aws ssm wait command-executed --command-id "$CMD" --instance-id "$INSTANCE"
aws ssm get-command-invocation --command-id "$CMD" --instance-id "$INSTANCE" \
  --query '{Status:Status,Stdout:StandardOutputContent,Stderr:StandardErrorContent}'
```

`--accept-data-loss` is required because Prisma sees the schema-drift from the legacy `Neon`-era columns; in practice the new columns are additive and nothing is dropped on a current-schema database. If you want to be paranoid, run with `--skip-generate` only (no `--accept-data-loss`) first — it'll tell you exactly what it wants to do.

Verify the new columns exist:

```bash
cat > /tmp/verify-schema.sh <<EOSH
set -e
SECRET=\$(aws secretsmanager get-secret-value --region $REGION --secret-id "$APP_SECRET_ARN" --query SecretString --output text)
PGUSER=\$(echo "\$SECRET" | jq -r .username)
export PGPASSWORD=\$(echo "\$SECRET" | jq -r .password)
psql "host=$PROXY_HOST port=5432 user=\$PGUSER dbname=$DB_NAME sslmode=require" -c '\d "Bill"' | head -40
psql "host=$PROXY_HOST port=5432 user=\$PGUSER dbname=$DB_NAME sslmode=require" -c '\d "BillImageAsset"'
psql "host=$PROXY_HOST port=5432 user=\$PGUSER dbname=$DB_NAME sslmode=require" -tAc "SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND indexname='Bill_search_vector_idx';"
EOSH
jq -Rs '{commands:[.]}' < /tmp/verify-schema.sh > /tmp/verify-schema-params.json
CMD=$(aws ssm send-command --instance-ids "$INSTANCE" --document-name AWS-RunShellScript \
  --parameters file:///tmp/verify-schema-params.json --query Command.CommandId --output text)
aws ssm wait command-executed --command-id "$CMD" --instance-id "$INSTANCE"
aws ssm get-command-invocation --command-id "$CMD" --instance-id "$INSTANCE" --query 'StandardOutputContent' --output text
```

Expect to see `progressStage`, `stageReachedAt`, `latestActionText`, `lastSyncedAt`, `legislativeSubjects`, `imageAssetId`, `search_vector` on `Bill`, plus the `BillImageAsset` table and a `Bill_search_vector_idx` GIN index.

### 1.4 Swap the ECS image

```bash
# Get the current task def JSON.
aws ecs describe-task-definition --task-definition civic-connect-web --region us-east-1 \
  --query 'taskDefinition' > /tmp/td.json

# Strip the fields ECS won't accept on registration, swap the image, register.
NEW_TD=$(jq --arg img "$IMAGE" '
  .containerDefinitions[0].image = $img
  | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)
' /tmp/td.json)
echo "$NEW_TD" > /tmp/td-new.json

NEW_ARN=$(aws ecs register-task-definition --region us-east-1 \
  --cli-input-json file:///tmp/td-new.json \
  --query 'taskDefinition.taskDefinitionArn' --output text)
echo "Registered: $NEW_ARN"

aws ecs update-service --cluster default --service civic-connect-web --region us-east-1 \
  --task-definition "$NEW_ARN" --force-new-deployment
```

### 1.5 Watch the rollout

```bash
aws ecs describe-services --cluster default --services civic-connect-web --region us-east-1 \
  --query 'services[0].deployments[].[status,taskDefinition,desiredCount,runningCount,rolloutState]' --output table
```

Wait until the new deployment shows `PRIMARY` / `COMPLETED` and the old `ACTIVE` deployment drains. Tail logs if you want eyes on boot:

```bash
LG=$(aws logs describe-log-groups --region us-east-1 \
  --log-group-name-prefix /aws/ecs/default/civic-connect-web \
  --query 'logGroups[0].logGroupName' --output text)
aws logs tail "$LG" --since 5m --follow --region us-east-1
```

### 1.5.5 Invalidate the website CloudFront edge cache

The website-fronting CloudFront distribution caches `/` and `/bills/:path*` HTML for `s-maxage=60` + `stale-while-revalidate=300` (`civic-connect/next.config.mjs`). That means **for ~6 minutes after the ECS rollout completes, visitors can still receive HTML that references the old build's content-hashed JS chunks** — which the new container no longer ships. The browser then 404s on those chunk URLs and falls into the `ClientErrorBoundary` "safe fallback" UI. Symptoms: page flashes, then "The page hit a client error" + console `ChunkLoadError`.

Invalidate the edge cache as soon as the deployment shows `PRIMARY`/`COMPLETED`:

```bash
# Find the site distribution (filter by alias containing 'civicconnect' — image-pool
# distribution from §3 has no aliases, so it won't match).
DIST_ID=$(aws cloudfront list-distributions --region us-east-1 \
  --query "DistributionList.Items[?Aliases.Items != null && Aliases.Items[?contains(@, 'civicconnect')]].Id | [0]" \
  --output text)
test -n "$DIST_ID" && test "$DIST_ID" != "None" || { echo "could not find site distribution; aborting"; exit 1; }
echo "Site distribution: $DIST_ID"

INV_ID=$(aws cloudfront create-invalidation --region us-east-1 \
  --distribution-id "$DIST_ID" --paths '/*' \
  --query 'Invalidation.Id' --output text)
echo "Invalidation: $INV_ID"

# Block until the invalidation completes (~30-90s). Don't run §1.6 until this finishes,
# or the validation curls will hit stale HTML and falsely report "fine."
aws cloudfront wait invalidation-completed --region us-east-1 \
  --distribution-id "$DIST_ID" --id "$INV_ID"
echo "Invalidation done."
```

Notes:
- `/*` invalidates everything, including `/_next/static/...` chunks. That's fine — chunk filenames are content-hashed, so the next request for each chunk simply re-fetches from ECS and re-warms the edge. No correctness risk; small cold-cache latency hit for the first wave of post-deploy requests.
- CloudFront free tier covers **1,000 path invalidations / month**. `/*` counts as one (the wildcard is the path), so a deploy a day is well within free tier.
- **Do not** invalidate the image-pool distribution from §3. Its keys are content-hashed (sha256 in the object name) and `cdnUrl` values in `BillImageAsset` are immutable. Invalidating it wastes the free-tier budget and re-warms a cache that didn't need it.
- If `DIST_ID` resolves to `None`, the alias filter didn't match — list distributions with `aws cloudfront list-distributions --query 'DistributionList.Items[].[Id, DomainName, Aliases.Items]' --output table` and find the one fronting the website, then hard-code its ID.

### 1.6 Validate

```bash
curl -sS https://www.civicconnect.net/api/test
curl -sS -o /dev/null -w '%{http_code}\n' https://www.civicconnect.net/
curl -sS -o /dev/null -w '%{http_code}\n' https://www.civicconnect.net/bills
curl -sS 'https://www.civicconnect.net/api/bills?limit=1'
# Hit one bill detail page directly to verify the new progressStage / search_vector code path.
BID=$(curl -sS 'https://www.civicconnect.net/api/bills?limit=1' | jq -r '.bills[0].id')
curl -sS -o /dev/null -w '%{http_code}\n' "https://www.civicconnect.net/bill/${BID}"
# Search needs the FTS column + trigger:
curl -sS 'https://www.civicconnect.net/api/bills?query=transparency&limit=3' | jq '.bills | length'
```

If anything looks wrong, roll back: `aws ecs update-service ... --task-definition <prior task-def revision>`. The schema change is additive, so the older image keeps working against the new DB.

> Do **not** tear down the bastion yet. Step 2 reuses it.

---

## 2. Replace the production database with the local mirror

This is the destructive part. Read everything before running anything.

### 2.0 Pre-flight: confirm the mirror is what you think it is

```bash
docker exec civic-mirror-db psql -U postgres -d civicconnect -tAc 'SELECT COUNT(*) FROM "Bill"'
docker exec civic-mirror-db psql -U postgres -d civicconnect -tAc 'SELECT COUNT(*) FROM "Representative"'
docker exec civic-mirror-db psql -U postgres -d civicconnect -tAc 'SELECT COUNT(*) FROM "User"'
docker exec civic-mirror-db psql -U postgres -d civicconnect -tAc 'SELECT version()'
docker exec civic-mirror-db psql -U postgres -d civicconnect -tAc "
  SELECT max(\"createdAt\") FROM \"Bill\";
  SELECT max(\"createdAt\") FROM \"User\";
"
```

If those numbers don't match what you expect to push to prod, **stop here** — re-hydrate the mirror via `AWS_LOCAL_DB_MIRROR.md` first.

### 2.1 Take a fresh prod snapshot before you destroy anything

Two independent rollback paths — pick at least one, ideally both.

**Path A — RDS cluster snapshot (point-in-time, fastest restore, no laptop bandwidth):**

```bash
CLUSTER_ID=$(aws rds describe-db-clusters --region us-east-1 \
  --query 'DBClusters[?contains(DBClusterIdentifier, `civic`)].DBClusterIdentifier' --output text)
SNAP_ID="civic-prod-pre-restore-$(date -u +%Y%m%d-%H%M%S)"
aws rds create-db-cluster-snapshot --region us-east-1 \
  --db-cluster-identifier "$CLUSTER_ID" --db-cluster-snapshot-identifier "$SNAP_ID"
echo "Snapshot id: $SNAP_ID"
aws rds wait db-cluster-snapshot-available --region us-east-1 \
  --db-cluster-snapshot-identifier "$SNAP_ID"
```

Snapshot completion takes a few minutes for a small Aurora cluster.

**Path B — logical dump to S3 (lets you inspect / diff later):**

Reuse the bastion. We need a temporary S3 bucket and S3 perms on the role.

```bash
BUCKET=civic-prod-snapshot-$STAMP
aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

aws iam put-role-policy --role-name "$ROLE" --policy-name s3rw --policy-document "$(cat <<EOF
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["s3:PutObject","s3:GetObject","s3:AbortMultipartUpload","s3:ListBucket"],"Resource":["arn:aws:s3:::${BUCKET}","arn:aws:s3:::${BUCKET}/*"]}
]}
EOF
)"

cat > /tmp/snapshot-prod.sh <<EOSH
set -euo pipefail
exec > /tmp/snapshot.log 2>&1
dnf -y install -q postgresql17 jq
SECRET=\$(aws secretsmanager get-secret-value --region $REGION --secret-id "$APP_SECRET_ARN" --query SecretString --output text)
export PGPASSWORD=\$(echo "\$SECRET" | jq -r .password)
PGUSER=\$(echo "\$SECRET" | jq -r .username)
pg_dump "host=$PROXY_HOST port=5432 user=\$PGUSER dbname=$DB_NAME sslmode=require" \
  --format=custom --schema=public --no-owner --no-acl --no-publications --no-subscriptions \
  -f /tmp/prod-pre-restore.dump
aws s3 cp /tmp/prod-pre-restore.dump "s3://$BUCKET/prod-pre-restore-$STAMP.dump"
EOSH
jq -Rs '{commands:[.]}' < /tmp/snapshot-prod.sh > /tmp/snapshot-prod-params.json
CMD=$(aws ssm send-command --instance-ids "$INSTANCE" --document-name AWS-RunShellScript \
  --parameters file:///tmp/snapshot-prod-params.json --query Command.CommandId --output text)
aws ssm wait command-executed --command-id "$CMD" --instance-id "$INSTANCE"

mkdir -p civic-connect/.local-dumps
aws s3 cp "s3://$BUCKET/prod-pre-restore-$STAMP.dump" \
  "civic-connect/.local-dumps/civic-prod-PRE-RESTORE-$STAMP.dump"
```

### 2.2 Dump the local mirror

```bash
docker exec civic-mirror-db pg_dump -U postgres -d civicconnect \
  --format=custom --schema=public --no-owner --no-acl \
  --no-publications --no-subscriptions \
  -f /tmp/mirror.dump
docker cp civic-mirror-db:/tmp/mirror.dump "civic-connect/.local-dumps/civic-mirror-$STAMP.dump"
ls -lh "civic-connect/.local-dumps/civic-mirror-$STAMP.dump"
```

Why `--no-owner --no-acl`: the local DB owns objects as `postgres`, but on Aurora we want them owned by the master user. We re-grant to the app user after the restore.

### 2.3 Find the Aurora master credentials

The destructive parts (`DROP SCHEMA`, `pg_restore` of types/extensions) need a superuser-ish role. The app user (`civicconnect_app`) doesn't have those privileges. Aurora's master user lives in the RDS-managed secret:

```bash
MASTER_SECRET_ARN=$(aws secretsmanager list-secrets --region us-east-1 \
  --query 'SecretList[?starts_with(Name,`rds!cluster-`)].ARN' --output text)
echo "Master secret: $MASTER_SECRET_ARN"
```

Add it to the bastion role's permitted secrets:

```bash
aws iam put-role-policy --role-name "$ROLE" --policy-name dbrestore --policy-document "$(cat <<EOF
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["secretsmanager:GetSecretValue"],"Resource":["${APP_SECRET_ARN}","${MASTER_SECRET_ARN}"]},
 {"Effect":"Allow","Action":["s3:GetObject","s3:ListBucket"],"Resource":["arn:aws:s3:::${BUCKET}","arn:aws:s3:::${BUCKET}/*"]}
]}
EOF
)"
```

### 2.4 Upload the mirror dump to S3

```bash
aws s3 cp "civic-connect/.local-dumps/civic-mirror-$STAMP.dump" \
  "s3://$BUCKET/mirror-$STAMP.dump"
```

### 2.5 Stop traffic-driven writes during the swap

Two options — pick one. Both prevent the app from racing the restore.

**Option A — scale the ECS service to 0** (full outage, simplest):
```bash
aws ecs update-service --cluster default --service civic-connect-web --region us-east-1 \
  --desired-count 0
# Wait for tasks to drain.
aws ecs wait services-stable --cluster default --services civic-connect-web --region us-east-1
```

**Option B — pause the EventBridge schedules** (ingest/scrape/digest stop; web stays up reading stale data while you swap, which is risky if the page touches anything you're about to drop). For a full DB replace, **prefer Option A.**

### 2.6 Drop + restore via the bastion

This block runs entirely on the bastion. It pulls master creds, drops `public`, restores with `pg_restore`, then re-grants to the app user. Direct connection bypasses the proxy because RDS Proxy session-pinning + DDL can be flaky for `pg_restore`.

Find the cluster writer endpoint:

```bash
WRITER_HOST=$(aws rds describe-db-clusters --region us-east-1 \
  --db-cluster-identifier "$CLUSTER_ID" \
  --query 'DBClusters[0].Endpoint' --output text)
echo "Writer endpoint: $WRITER_HOST"
```

Open ingress from the bastion SG to the cluster SG (Aurora and the proxy may share an SG; if not, grant separately):

```bash
CLUSTER_SG=$(aws rds describe-db-clusters --region us-east-1 \
  --db-cluster-identifier "$CLUSTER_ID" \
  --query 'DBClusters[0].VpcSecurityGroups[0].VpcSecurityGroupId' --output text)
CLUSTER_RULE=$(aws ec2 authorize-security-group-ingress --group-id "$CLUSTER_SG" \
  --ip-permissions "IpProtocol=tcp,FromPort=5432,ToPort=5432,UserIdGroupPairs=[{GroupId=$SG}]" \
  --query 'SecurityGroupRules[0].SecurityGroupRuleId' --output text 2>/dev/null || echo "")
# Empty value is fine — means the rule already exists or the cluster SG is the proxy SG (already granted in 1.3).
```

Now run the restore:

```bash
cat > /tmp/restore-prod.sh <<EOSH
set -euo pipefail
exec > /tmp/restore.log 2>&1
dnf -y install -q postgresql17 jq

MASTER=\$(aws secretsmanager get-secret-value --region $REGION --secret-id "$MASTER_SECRET_ARN" --query SecretString --output text)
APP=\$(aws secretsmanager get-secret-value --region $REGION --secret-id "$APP_SECRET_ARN" --query SecretString --output text)

export PGPASSWORD=\$(echo "\$MASTER" | jq -r .password)
MASTER_USER=\$(echo "\$MASTER" | jq -r .username)
APP_USER=\$(echo "\$APP" | jq -r .username)

CONN="host=$WRITER_HOST port=5432 user=\$MASTER_USER dbname=$DB_NAME sslmode=require"

# Sanity check first.
psql "\$CONN" -tAc 'SELECT current_user, current_database(), version()'
psql "\$CONN" -tAc 'SELECT COUNT(*) FROM "Bill"'

# Download dump.
aws s3 cp "s3://$BUCKET/mirror-$STAMP.dump" /tmp/mirror.dump

# Drop public, recreate, grant defaults for the app user.
psql "\$CONN" -v ON_ERROR_STOP=1 <<SQL
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT USAGE, CREATE ON SCHEMA public TO PUBLIC;
GRANT ALL ON SCHEMA public TO "\${APP_USER}";
SQL

# Restore. --no-owner + --role re-target ownership to the master user so the app
# user can SELECT/UPDATE via its own role grants below.
pg_restore --no-owner --no-acl --exit-on-error \
  -d "\$CONN" /tmp/mirror.dump

# Re-grant on every restored object.
psql "\$CONN" -v ON_ERROR_STOP=1 <<SQL
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "\${APP_USER}";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO "\${APP_USER}";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO "\${APP_USER}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "\${APP_USER}";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO "\${APP_USER}";
SQL

# Verify.
psql "\$CONN" -c 'SELECT COUNT(*) AS bills FROM "Bill"'
psql "\$CONN" -c 'SELECT COUNT(*) AS users FROM "User"'
psql "\$CONN" -c 'SELECT COUNT(*) AS reps FROM "Representative"'

# Confirm the app user can read.
export PGPASSWORD=\$(echo "\$APP" | jq -r .password)
psql "host=$PROXY_HOST port=5432 user=\$APP_USER dbname=$DB_NAME sslmode=require" \
  -tAc 'SELECT COUNT(*) FROM "Bill"'
EOSH

jq -Rs '{commands:[.]}' < /tmp/restore-prod.sh > /tmp/restore-prod-params.json
CMD=$(aws ssm send-command --instance-ids "$INSTANCE" --document-name AWS-RunShellScript \
  --parameters file:///tmp/restore-prod-params.json --query Command.CommandId --output text)
aws ssm wait command-executed --command-id "$CMD" --instance-id "$INSTANCE"
aws ssm get-command-invocation --command-id "$CMD" --instance-id "$INSTANCE" \
  --query '{Status:Status,Stdout:StandardOutputContent,Stderr:StandardErrorContent}'
```

If the FTS index/trigger lives in `prisma/sql/bill_search_vector.sql` and the dump didn't include it (it ships in the schema if the mirror has been kept current with `npm run setup:search`; if not, re-apply now):

```bash
# Same shape as step 1.3 — apply the FTS SQL through the app user.
```

### 2.7 Bring the app back

```bash
aws ecs update-service --cluster default --service civic-connect-web --region us-east-1 \
  --desired-count 1   # or whatever the prior desired count was
aws ecs wait services-stable --cluster default --services civic-connect-web --region us-east-1
```

Re-run the validation block from 1.6. Pay special attention to:

- `/api/test` — checks DB connectivity end-to-end.
- `/api/bills?limit=1` — confirms reads.
- `/api/bills?query=...` — confirms FTS still works.
- `/bill/<id>` — confirms `progressStage`, `latestActionText`, image fallback all render.

If anything is broken and rollback is needed: restore from the snapshot taken in 2.1 (Path A is fastest — `aws rds restore-db-cluster-from-snapshot` into a new cluster, then re-point app, or use `aws rds restore-db-cluster-to-point-in-time` against the original).

### 2.8 Tear down

```bash
# Revoke ingress added during the run.
aws ec2 revoke-security-group-ingress --group-id "$PROXY_SG" --security-group-rule-ids "$RULE"
[ -n "$CLUSTER_RULE" ] && aws ec2 revoke-security-group-ingress --group-id "$CLUSTER_SG" --security-group-rule-ids "$CLUSTER_RULE"

# Terminate bastion.
aws ec2 terminate-instances --instance-ids "$INSTANCE" >/dev/null
aws ec2 wait instance-terminated --instance-ids "$INSTANCE"
aws ec2 delete-security-group --group-id "$SG"

# IAM cleanup.
aws iam remove-role-from-instance-profile --instance-profile-name "$ROLE" --role-name "$ROLE"
aws iam delete-instance-profile --instance-profile-name "$ROLE"
aws iam delete-role-policy --role-name "$ROLE" --policy-name dbmigrate || true
aws iam delete-role-policy --role-name "$ROLE" --policy-name dbrestore || true
aws iam delete-role-policy --role-name "$ROLE" --policy-name s3rw || true
aws iam detach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam delete-role --role-name "$ROLE"

# Drop the S3 bucket (keeps the local copy of the pre-restore dump under .local-dumps/).
aws s3 rm "s3://$BUCKET" --recursive
aws s3api delete-bucket --bucket "$BUCKET"
```

Keep the cluster snapshot from 2.1 Path A for at least a few days as your safety net — `aws rds delete-db-cluster-snapshot --db-cluster-snapshot-identifier <id>` when you're confident.

---

## 3. Bill image pool: S3 + CloudFront migration (one-time)

This section migrates the locally-curated bill-image pool into production. After §1+§2 the prod DB has the `BillImageAsset` table from `prisma db push` but the table is empty (or holds the local-mirror rows whose `cdnUrl` points at relative dev paths like `/curated-images/v1/...`). We:

1. Stand up the prod-side image infrastructure (private S3 bucket fronted by a new CloudFront distribution).
2. Upload the 1,711 image files (~436 MB) from the local checkout to S3.
3. Run the one-time Titan Multimodal embedding pass over the local mirror so the rows we migrate already carry their 1024-dim embedding.
4. Migrate `BillImageAsset` rows into Aurora and rewrite `cdnUrl` from the dev prefix to the CloudFront host.
5. Re-backfill `Bill.imageAssetId` against Aurora (the cosine-best path now wins because both bills and assets are embedded).
6. Update the ECS task definition with `IMAGE_S3_BUCKET` / `IMAGE_CDN_HOST` and roll the service forward.

Steps 3.1–3.4 are **non-destructive** and can be done at any time. Step 3.5 (`s3 sync`) is also safe — `--cache-control` doesn't change object content. The first user-visible change is 3.9 (rolling deploy with the new env vars). Until 3.9 lands, bills keep serving via the legacy `Bill.imageUrl` fallback.

> Prerequisite: §1 must already be run with code that includes `BillImageAsset.embedding`, `BillImageAsset.embeddedAt`, `Bill.topicEmbedding`, `Bill.topicEmbeddedAt`, plus `lib/embeddings.ts` and `scripts/embed-image-pool.ts`. If the live image was built before those columns landed, redo §1.

### 3.0 Prerequisites

- AWS CLI v2 authenticated to `712589718735` / `us-east-1` (`aws sts get-caller-identity`).
- `civic-mirror-db` is healthy and holds the curated rows:
  ```bash
  docker exec civic-mirror-db psql -U postgres -d civicconnect -tAc \
    'SELECT COUNT(*) FROM "BillImageAsset" WHERE "retiredAt" IS NULL'
  # expect: 1711 (or whatever the latest curate run produced)
  du -sh civic-connect/public/curated-images/v1
  # expect: ~436M
  ```
  If §2 (the destructive DB swap) was re-run with a fresh prod dump that lacks `BillImageAsset` rows, re-curate locally before continuing — the migration source is the local mirror.
- The **embeddings code is in the deployed image** (see prerequisite blockquote above).
- Reuse the bastion variables from §1.3 (`STAMP`, `INSTANCE`, `SG`, `RULE`, `ROLE`, `REGION`, `VPC`, `SUBNET`, `PROXY_HOST`, `PROXY_SG`, `APP_SECRET_ARN`, `DB_NAME`). If you tore down the bastion at the end of §2.8, re-create it via §1.3.

### 3.1 Pin pool-side env vars

```bash
BUCKET_IMAGES=civic-connect-images
# Filled in by 3.3 once the distribution is live; placeholder for now.
CDN_HOST=""
```

### 3.2 Create the S3 bucket

Bucket is private — only CloudFront can read it (via OAC in §3.3). All four Block-Public-Access flags on. Versioning suspended (sha256 keys make versioning redundant, and it would inflate billing if a future cleanup script deletes a key).

```bash
aws s3api create-bucket --bucket "$BUCKET_IMAGES" --region us-east-1
aws s3api put-public-access-block --bucket "$BUCKET_IMAGES" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-versioning --bucket "$BUCKET_IMAGES" \
  --versioning-configuration Status=Suspended
# Light-touch ownership: bucket owner owns everything.
aws s3api put-bucket-ownership-controls --bucket "$BUCKET_IMAGES" \
  --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
```

### 3.3 Create the CloudFront distribution + Origin Access Control

CloudFront fetches from the bucket as the only public path; the bucket itself stays private.

```bash
# 1) Create the OAC.
OAC_ID=$(aws cloudfront create-origin-access-control \
  --origin-access-control-config '{
    "Name": "civic-connect-images-oac",
    "Description": "OAC for civic-connect-images bucket",
    "SigningProtocol": "sigv4",
    "SigningBehavior": "always",
    "OriginAccessControlOriginType": "s3"
  }' --query 'OriginAccessControl.Id' --output text)
echo "OAC: $OAC_ID"

# 2) Create the distribution.
ORIGIN_DOMAIN="${BUCKET_IMAGES}.s3.us-east-1.amazonaws.com"
cat > /tmp/dist-config.json <<JSON
{
  "CallerReference": "civic-connect-images-$(date -u +%Y%m%d-%H%M%S)",
  "Comment": "civic-connect bill image pool",
  "Enabled": true,
  "PriceClass": "PriceClass_100",
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "s3-civic-connect-images",
      "DomainName": "${ORIGIN_DOMAIN}",
      "S3OriginConfig": { "OriginAccessIdentity": "" },
      "OriginAccessControlId": "${OAC_ID}",
      "ConnectionAttempts": 3,
      "ConnectionTimeout": 10,
      "OriginShield": { "Enabled": false }
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-civic-connect-images",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2, "Items": ["GET","HEAD"],
      "CachedMethods": { "Quantity": 2, "Items": ["GET","HEAD"] }
    },
    "Compress": true,
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6"
  },
  "HttpVersion": "http2and3",
  "IsIPV6Enabled": true,
  "ViewerCertificate": { "CloudFrontDefaultCertificate": true }
}
JSON
DIST_JSON=$(aws cloudfront create-distribution --distribution-config file:///tmp/dist-config.json)
DIST_ID=$(echo "$DIST_JSON" | jq -r '.Distribution.Id')
DIST_ARN=$(echo "$DIST_JSON" | jq -r '.Distribution.ARN')
DIST_DOMAIN=$(echo "$DIST_JSON" | jq -r '.Distribution.DomainName')
CDN_HOST="https://${DIST_DOMAIN}"
echo "Distribution: $DIST_ID ($DIST_DOMAIN)"
echo "CDN_HOST=$CDN_HOST"
```

The `CachePolicyId` above is AWS-managed `Managed-CachingOptimized` (forwards no headers, caches by URL — exactly what you want for immutable-by-sha256 content).

Lock the bucket policy to **only** this distribution:

```bash
cat > /tmp/bucket-policy.json <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFrontServicePrincipal",
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::${BUCKET_IMAGES}/*",
    "Condition": { "StringEquals": { "AWS:SourceArn": "${DIST_ARN}" } }
  }]
}
JSON
aws s3api put-bucket-policy --bucket "$BUCKET_IMAGES" --policy file:///tmp/bucket-policy.json
```

Wait until the distribution flips from `InProgress` to `Deployed` (typically 3–5 minutes):

```bash
until [ "$(aws cloudfront get-distribution --id "$DIST_ID" --query 'Distribution.Status' --output text)" = "Deployed" ]; do
  sleep 15; echo "still deploying…"
done
echo "CloudFront ready: https://${DIST_DOMAIN}"
```

### 3.4 Upload image bytes to S3

Idempotent — `s3 sync` only PUTs files whose key+etag don't already exist on the destination, and sha256-named keys never collide. Re-runs are safe.

```bash
aws s3 sync civic-connect/public/curated-images/v1 "s3://${BUCKET_IMAGES}/v1" \
  --cache-control "public, max-age=31536000, immutable"

# Sanity check — bytes and object count should match the local pool.
aws s3 ls "s3://${BUCKET_IMAGES}/v1/" --recursive --summarize | tail -3
# Expect ~1711 objects, ~436 MB total.

# And per-cell:
aws s3 ls "s3://${BUCKET_IMAGES}/v1/loc-area/" | wc -l    # 32 prefixes
```

Spot-check one CloudFront URL works (pick any sha256 from the local pool):

```bash
SAMPLE=$(find civic-connect/public/curated-images/v1 -type f | head -1 | sed "s|civic-connect/public/curated-images/||")
curl -I "${CDN_HOST}/${SAMPLE}"
# expect: HTTP/2 200, content-type: image/jpeg (or png/webp),
#         cache-control: public, max-age=31536000, immutable
```

If you get `403 AccessDenied`, the bucket policy condition or OAC isn't bound — recheck §3.3.

### 3.5 Run the one-time Titan Multimodal embedding pass (against the local mirror)

Cheaper and faster against the local mirror; the embeddings travel with the rows in 3.7. Bedrock Titan Multimodal G1 v1 is region-pinned to `us-east-1`. Cost: ~$0.10–0.20 for 1,711 images.

```bash
cd civic-connect
set -a && . ./.env.local && set +a   # picks up DATABASE_URL pointing at civic-mirror-db
# AWS creds for Bedrock — same ones the curate script already uses.
# (lib/embeddings.ts uses the implicit credential chain; no special env needed beyond AWS_REGION.)
AWS_REGION=us-east-1 npm run embed:images
cd ..

# Verify every row got embedded.
docker exec civic-mirror-db psql -U postgres -d civicconnect -tAc '
  SELECT COUNT(*) FROM "BillImageAsset"
  WHERE "retiredAt" IS NULL AND array_length("embedding", 1) = 1024'
# Expect: 1711
```

Throttling and resume: the script reads only rows where `embeddedAt IS NULL`, so a crash mid-run resumes cleanly on the next invocation.

### 3.6 Dump `BillImageAsset` from the local mirror

`--data-only` because the table itself was already created by §1.3 on Aurora.

```bash
DUMP_NAME="bill-image-asset-$STAMP.dump"
docker exec civic-mirror-db pg_dump -U postgres -d civicconnect \
  --format=custom --schema=public --data-only \
  --table='public."BillImageAsset"' \
  --no-owner --no-acl \
  -f "/tmp/${DUMP_NAME}"
docker cp "civic-mirror-db:/tmp/${DUMP_NAME}" "civic-connect/.local-dumps/${DUMP_NAME}"
ls -lh "civic-connect/.local-dumps/${DUMP_NAME}"
# Expect ~14–18 MB (the 1024-float embeddings dominate).
```

### 3.7 Restore the rows into Aurora and rewrite `cdnUrl`

Reuse the bastion from §1/§2. Push the dump up via S3 (the bastion role already has S3 perms from §2 if you ran them in this session; if not, attach an inline policy granting `s3:GetObject` on the temporary bucket — the §2.1-Path-B `s3rw` policy is the same shape).

```bash
# Reuse the §2 BUCKET if it's still alive; otherwise create a fresh transit bucket.
TRANSIT_BUCKET="${BUCKET:-civic-imgmig-$STAMP}"
if ! aws s3api head-bucket --bucket "$TRANSIT_BUCKET" 2>/dev/null; then
  aws s3api create-bucket --bucket "$TRANSIT_BUCKET" --region us-east-1
  aws s3api put-public-access-block --bucket "$TRANSIT_BUCKET" \
    --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
fi
aws s3 cp "civic-connect/.local-dumps/${DUMP_NAME}" "s3://${TRANSIT_BUCKET}/${DUMP_NAME}"

# Make sure the bastion role can read the transit bucket and the new images bucket.
aws iam put-role-policy --role-name "$ROLE" --policy-name imgmig --policy-document "$(cat <<EOF
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["s3:GetObject","s3:ListBucket"],"Resource":["arn:aws:s3:::${TRANSIT_BUCKET}","arn:aws:s3:::${TRANSIT_BUCKET}/*"]},
 {"Effect":"Allow","Action":["secretsmanager:GetSecretValue"],"Resource":["${APP_SECRET_ARN}"]}
]}
EOF
)"
```

Now run the restore + URL rewrite on the bastion. We restore via the **app user through the proxy** — `BillImageAsset` is just data, no DDL, so the proxy is fine here (unlike §2.6).

```bash
cat > /tmp/migrate-images.sh <<EOSH
set -euo pipefail
exec > /tmp/imgmig.log 2>&1
dnf -y install -q postgresql17 jq

SECRET=\$(aws secretsmanager get-secret-value --region $REGION --secret-id "$APP_SECRET_ARN" --query SecretString --output text)
PGUSER=\$(echo "\$SECRET" | jq -r .username)
export PGPASSWORD=\$(echo "\$SECRET" | jq -r .password)
CONN="host=$PROXY_HOST port=5432 user=\$PGUSER dbname=$DB_NAME sslmode=require"

aws s3 cp "s3://${TRANSIT_BUCKET}/${DUMP_NAME}" /tmp/${DUMP_NAME}

# Truncate any existing rows so re-running is idempotent. Bills point at imageAssetId
# but it's nullable; the FK cascade is RESTRICT, so we set imageAssetId to NULL first.
psql "\$CONN" -v ON_ERROR_STOP=1 <<SQL
UPDATE "Bill" SET "imageAssetId" = NULL WHERE "imageAssetId" IS NOT NULL;
TRUNCATE TABLE "BillImageAsset";
SQL

# Restore data only.
pg_restore --no-owner --no-acl --exit-on-error --data-only \
  -d "\$CONN" /tmp/${DUMP_NAME}

# Rewrite cdnUrl: local pool was stored as relative '/curated-images/v1/...'.
# Move it to absolute CloudFront. Run twice with different patterns to be safe.
psql "\$CONN" -v ON_ERROR_STOP=1 <<SQL
UPDATE "BillImageAsset"
   SET "cdnUrl" = REPLACE("cdnUrl", '/curated-images/', '${CDN_HOST}/')
 WHERE "cdnUrl" LIKE '/curated-images/%';
UPDATE "BillImageAsset"
   SET "cdnUrl" = REPLACE("cdnUrl", 'http://localhost:3000/curated-images/', '${CDN_HOST}/')
 WHERE "cdnUrl" LIKE 'http://localhost:%';
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE "cdnUrl" LIKE '${CDN_HOST}%') AS on_cdn,
       COUNT(*) FILTER (WHERE array_length("embedding", 1) = 1024) AS embedded
  FROM "BillImageAsset";
SQL
EOSH

jq -Rs '{commands:[.]}' < /tmp/migrate-images.sh > /tmp/migrate-images-params.json
CMD=$(aws ssm send-command --instance-ids "$INSTANCE" --document-name AWS-RunShellScript \
  --parameters file:///tmp/migrate-images-params.json --query Command.CommandId --output text)
aws ssm wait command-executed --command-id "$CMD" --instance-id "$INSTANCE"
aws ssm get-command-invocation --command-id "$CMD" --instance-id "$INSTANCE" \
  --query '{Status:Status,Stdout:StandardOutputContent,Stderr:StandardErrorContent}'
```

Expect the SELECT at the end to show `total = on_cdn = embedded = 1711`.

### 3.8 Re-backfill `Bill.imageAssetId` against Aurora

Now that bills and assets in Aurora both have embeddings, the cosine path in `selectAssetForBill` wins and bills get the most-similar image in their cell.

```bash
cat > /tmp/backfill-bill-images.sh <<EOSH
set -euo pipefail
exec > /tmp/bbimg.log 2>&1
dnf -y install -q nodejs20 jq tar
ln -sf /usr/bin/node-20 /usr/local/bin/node || true

SECRET=\$(aws secretsmanager get-secret-value --region $REGION --secret-id "$APP_SECRET_ARN" --query SecretString --output text)
PGUSER=\$(echo "\$SECRET" | jq -r .username)
PGPASS=\$(echo "\$SECRET" | jq -r .password)
export DATABASE_URL="postgresql://\${PGUSER}:\${PGPASS}@$PROXY_HOST:5432/$DB_NAME?schema=public&sslmode=require"

# civic-prisma.tgz from §1.3 is at /opt/civic/. If the bastion was rebuilt, re-upload.
[ -d /opt/civic ] || { echo "ERR: /opt/civic missing. Re-run §1.3 upload."; exit 1; }
cd /opt/civic

# scripts/ + lib/ are needed for backfill — re-tarball client-side and re-upload if missing.
test -f scripts/backfill-bill-image-assets.ts || {
  echo "ERR: scripts/ not on bastion. Upload civic-connect/{prisma,scripts,lib,package.json,package-lock.json,tsconfig.json}.";
  exit 1; }

npm install --no-audit --no-fund --silent
npx prisma generate
npm run backfill:bill-images
EOSH
```

If `scripts/` and `lib/` aren't on the bastion (the §1.3 upload only included `prisma/` and `package*.json`), tar them up and re-upload before running. Pattern:

```bash
tar czf /tmp/civic-app.tgz -C civic-connect prisma scripts lib package.json package-lock.json tsconfig.json
B64=$(base64 -w0 /tmp/civic-app.tgz)
# prepend the same `echo "$B64" | base64 -d > /tmp/civic-app.tgz; tar xzf` block to /tmp/backfill-bill-images.sh
```

Run it:

```bash
jq -Rs '{commands:[.]}' < /tmp/backfill-bill-images.sh > /tmp/backfill-bill-images-params.json
CMD=$(aws ssm send-command --instance-ids "$INSTANCE" --document-name AWS-RunShellScript \
  --parameters file:///tmp/backfill-bill-images-params.json --query Command.CommandId --output text)
aws ssm wait command-executed --command-id "$CMD" --instance-id "$INSTANCE"
aws ssm get-command-invocation --command-id "$CMD" --instance-id "$INSTANCE" \
  --query '{Status:Status,Stdout:StandardOutputContent,Stderr:StandardErrorContent}'
```

Verify:

```bash
cat > /tmp/verify-bbimg.sh <<EOSH
set -e
SECRET=\$(aws secretsmanager get-secret-value --region $REGION --secret-id "$APP_SECRET_ARN" --query SecretString --output text)
PGUSER=\$(echo "\$SECRET" | jq -r .username)
export PGPASSWORD=\$(echo "\$SECRET" | jq -r .password)
psql "host=$PROXY_HOST port=5432 user=\$PGUSER dbname=$DB_NAME sslmode=require" -c "
  SELECT
    (SELECT COUNT(*) FROM \"Bill\")                                   AS total_bills,
    (SELECT COUNT(*) FROM \"Bill\" WHERE \"imageAssetId\" IS NOT NULL) AS assigned,
    (SELECT COUNT(*) FROM \"BillImageAsset\")                         AS assets,
    (SELECT COUNT(*) FROM \"BillImageAsset\" WHERE array_length(\"embedding\",1)=1024) AS embedded;
"
EOSH
jq -Rs '{commands:[.]}' < /tmp/verify-bbimg.sh > /tmp/verify-bbimg-params.json
CMD=$(aws ssm send-command --instance-ids "$INSTANCE" --document-name AWS-RunShellScript \
  --parameters file:///tmp/verify-bbimg-params.json --query Command.CommandId --output text)
aws ssm wait command-executed --command-id "$CMD" --instance-id "$INSTANCE"
aws ssm get-command-invocation --command-id "$CMD" --instance-id "$INSTANCE" --query 'StandardOutputContent' --output text
```

`assigned` should approach `total_bills`. Bills whose policy area didn't end up in a cell stay unassigned and serve via the legacy fallback — fine.

### 3.9 Add `IMAGE_S3_BUCKET` / `IMAGE_CDN_HOST` to the ECS task definition and roll forward

Until this step the prod app is reading the (now fully-populated) `BillImageAsset.cdnUrl` from Aurora; CloudFront is serving the bytes — but the app doesn't yet know which CDN host is "trusted" for the `/api/bill-image/[id]` redirect target check. After this step the redirect endpoint and any client-side trust check accept the new host.

```bash
aws ecs describe-task-definition --task-definition civic-connect-web --region us-east-1 \
  --query 'taskDefinition' > /tmp/td.json

NEW_TD=$(jq --arg bucket "$BUCKET_IMAGES" --arg cdn "$CDN_HOST" '
  .containerDefinitions[0].environment += [
    { "name": "IMAGE_S3_BUCKET", "value": $bucket },
    { "name": "IMAGE_CDN_HOST",  "value": $cdn }
  ]
  | .containerDefinitions[0].environment |= (
      group_by(.name) | map(.[-1])    # de-dupe by name, keep last (the new values win)
    )
  | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)
' /tmp/td.json)
echo "$NEW_TD" > /tmp/td-imgenv.json

NEW_ARN=$(aws ecs register-task-definition --region us-east-1 \
  --cli-input-json file:///tmp/td-imgenv.json \
  --query 'taskDefinition.taskDefinitionArn' --output text)
echo "Registered: $NEW_ARN"

aws ecs update-service --cluster default --service civic-connect-web --region us-east-1 \
  --task-definition "$NEW_ARN" --force-new-deployment
aws ecs wait services-stable --cluster default --services civic-connect-web --region us-east-1
```

If the `civic-ingest-job` Lambda also needs the same env vars (it calls `embedText` for new bills), apply the same pair to its function configuration:

```bash
aws lambda update-function-configuration --function-name civic-ingest-job --region us-east-1 \
  --environment "Variables={IMAGE_S3_BUCKET=${BUCKET_IMAGES},IMAGE_CDN_HOST=${CDN_HOST}}"
# NB: this REPLACES the env block. Merge with existing keys first via:
aws lambda get-function-configuration --function-name civic-ingest-job --region us-east-1 \
  --query 'Environment.Variables' > /tmp/lambda-env.json
jq --arg b "$BUCKET_IMAGES" --arg c "$CDN_HOST" \
  '.IMAGE_S3_BUCKET=$b | .IMAGE_CDN_HOST=$c' /tmp/lambda-env.json \
  | jq -c '{Variables: .}' > /tmp/lambda-env-merged.json
aws lambda update-function-configuration --function-name civic-ingest-job --region us-east-1 \
  --environment "file:///tmp/lambda-env-merged.json"
```

### 3.10 Verify in prod

```bash
curl -sS https://www.civicconnect.net/api/test
curl -sS -o /dev/null -w '%{http_code}\n' https://www.civicconnect.net/
curl -sS -o /dev/null -w '%{http_code}\n' https://www.civicconnect.net/bills
BID=$(curl -sS 'https://www.civicconnect.net/api/bills?limit=1' | jq -r '.bills[0].id')
curl -sSI "https://www.civicconnect.net/api/bill-image/${BID}"
# expect: HTTP/2 307, location: https://<dXXX>.cloudfront.net/v1/loc-area/...

# Confirm imageUrl points at CloudFront, not Wikimedia. (The homepage is now
# server-rendered, so use /api/bills which exposes the same imageUrl field
# the home feed reads. /api/home-feed was removed.)
curl -sS 'https://www.civicconnect.net/api/bills?limit=1' | jq '.bills[0].imageUrl'
# expect: "https://<dXXX>.cloudfront.net/v1/loc-area/..."

# Open the page in a browser. Devtools network panel must show:
#   - zero requests to upload.wikimedia.org
#   - image responses 200 with cache-control: public, max-age=31536000, immutable
#   - server-timing or X-Cache: Hit from cloudfront after first hit
```

Spot-check semantic relevance — pick two Health bills with different subjects:

```bash
curl -sS 'https://www.civicconnect.net/api/bills?limit=20' \
  | jq '.bills[] | select(.topicTags | tostring | test("Health"))
        | { id, title, imageUrl }' | head -40
```

The chosen images should differ along subject lines (Medicare-leaning bill → elderly/hospital imagery; vaccine bill → clinical/lab imagery). If both bills resolved to the same hash-picked filler photo, embeddings didn't apply — recheck `array_length("embedding",1)=1024` in §3.7 and `topicEmbedding` on the bills.

### 3.11 Rollback

The new schema columns and table are additive, so older containers ignore them. To unwind:

```bash
# 1) Roll the ECS service back to the prior task definition (which lacks IMAGE_S3_BUCKET/IMAGE_CDN_HOST).
PRIOR_TD=$(aws ecs describe-services --cluster default --services civic-connect-web --region us-east-1 \
  --query 'services[0].deployments[?status==`ACTIVE`] | [0].taskDefinition' --output text)
aws ecs update-service --cluster default --service civic-connect-web --region us-east-1 \
  --task-definition "$PRIOR_TD" --force-new-deployment
```

The S3 bucket, CloudFront distribution, and Aurora rows can stay in place — they cost <$0.10/mo idle and re-rolling forward is just another `aws ecs update-service`. If a teardown is required:

```bash
# Disable & delete the distribution (this is a multi-step process — disabled first, deployed, then deleted).
aws cloudfront get-distribution-config --id "$DIST_ID" > /tmp/dc.json
ETAG=$(jq -r '.ETag' /tmp/dc.json)
jq '.DistributionConfig.Enabled=false | .DistributionConfig' /tmp/dc.json > /tmp/dc-disabled.json
aws cloudfront update-distribution --id "$DIST_ID" --if-match "$ETAG" \
  --distribution-config file:///tmp/dc-disabled.json
# Wait for Deployed, then:
ETAG=$(aws cloudfront get-distribution --id "$DIST_ID" --query 'ETag' --output text)
aws cloudfront delete-distribution --id "$DIST_ID" --if-match "$ETAG"
aws cloudfront delete-origin-access-control --id "$OAC_ID" --if-match "$(aws cloudfront get-origin-access-control --id "$OAC_ID" --query 'ETag' --output text)"
aws s3 rm "s3://${BUCKET_IMAGES}" --recursive
aws s3api delete-bucket --bucket "$BUCKET_IMAGES"
```

### 3.12 Tear down the §1/§2 bastion (if not done earlier)

If §3 is the last operation in this session and the §1.3 bastion is still alive, follow §2.8's teardown block — same instance/role/SG/rules.

Also drop the `imgmig` inline policy added in §3.7:

```bash
aws iam delete-role-policy --role-name "$ROLE" --policy-name imgmig || true
[ -n "$TRANSIT_BUCKET" ] && [ "$TRANSIT_BUCKET" != "$BUCKET" ] && {
  aws s3 rm "s3://${TRANSIT_BUCKET}" --recursive
  aws s3api delete-bucket --bucket "$TRANSIT_BUCKET"
}
```

### 3.13 Close-out

```bash
gh issue comment 3 --body "$(cat <<MD
Image-pool migration completed.

- Bucket: \`s3://${BUCKET_IMAGES}\` (private, BPA on)
- Distribution: \`${DIST_ID}\` → \`${CDN_HOST}\`
- Assets: 1,711 in \`BillImageAsset\` (Postgres) + matching objects in S3
- Embeddings: 1,711 / 1,711 BillImageAssets, all bills with topic embeddings
- Sample: \`${CDN_HOST}/$(printf %s "$SAMPLE")\`

The legacy Wikimedia hotlinks no longer fire from prod page renders.
MD
)"
gh issue close 3
```

---

## Notes

- **The whole thing has to run in `us-east-1`.** If `aws sts get-caller-identity` shows a different region or account, stop.
- **Don't bypass `--platform linux/amd64`.** Apple Silicon and other arm64 hosts will silently build arm64 images that crash on Fargate x86 tasks.
- **Don't restore through the RDS Proxy.** Connection pinning during DDL has caused half-applied restores in the past. Always target the cluster writer endpoint for the destructive path.
- **Re-grant is non-optional.** A dump made with `--no-owner --no-acl` has no privileges baked in. Skipping the `GRANT` block leaves the app user without read access and the homepage 500s with "permission denied for table Bill".
- **`DROP SCHEMA public CASCADE` deletes the `neon_auth` schema?** No — `neon_auth` is a separate schema and is left alone. The dump and restore are both scoped to `public`.
- **Image-pool migration:** see §3 below. The current playbook migrates the locally-curated 1,711-image pool from `civic-mirror-db` + `civic-connect/public/curated-images/` into a new S3 bucket + CloudFront distribution, sets `IMAGE_S3_BUCKET` / `IMAGE_CDN_HOST` on the ECS task def, and (per the embedding upgrade in `lib/image-pool.ts`) runs a one-time Bedrock Titan Multimodal embedding pass so within-cell selection picks the most semantically-similar image per bill instead of a random hash. Until §3 is run, bills serve via the legacy `Bill.imageUrl` fallback path.
