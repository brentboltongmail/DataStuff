# EC2 “no instance found” (Hogsmeade-style access tool)

## What happened

```text
Listing EC2 Instances...
Failed to verify instance was running error="no instance found" func=Run
panic: Failed to verify instance was running
```

The tool listed EC2 instances, found **zero** that matched its filter, then aborted before starting the proxy/tunnel.

When this path works (from earlier sessions), the next line looks like:

```text
Headed to Hogsmeade with i-003c48cd0b53e2910...
```

So it expects a specific (or tagged) instance to already be **running** and visible under the current AWS credentials/region.

## Likely causes (in order)

1. **Instance is stopped / terminated** — most common for “no instance found” right after list.
2. **Wrong AWS profile or account** — `AWS_PROFILE` / SSO session pointing at the wrong account.
3. **Wrong region** — instance exists elsewhere (e.g. `us-east-1` vs `us-east-2`).
4. **SSO / credentials expired** — list returns empty or fails in a way the tool surfaces as not found.
5. **Tag / name filter mismatch** — tool looks for a specific Name/tag and nothing matches.

## What to check

```bash
# Who am I talking to?
aws sts get-caller-identity

# What’s running (adjust region/profile as needed)?
aws ec2 describe-instances \
  --region us-east-1 \
  --filters "Name=instance-state-name,Values=running,pending,stopped" \
  --query 'Reservations[].Instances[].[InstanceId,State.Name,Tags[?Key==`Name`].Value|[0]]' \
  --output table
```

If you know the instance id from a good run (e.g. `i-003c48cd0b53e2910`):

```bash
aws ec2 describe-instances --instance-ids i-003c48cd0b53e2910 \
  --query 'Reservations[].Instances[].[InstanceId,State.Name,Placement.AvailabilityZone]' \
  --output table

# Start it if stopped
aws ec2 start-instances --instance-ids i-003c48cd0b53e2910
```

Then re-run the access tool once state is `running`.

## Relation to the BIPUB URL query

```sql
SELECT description
FROM   fnd_lookup_values
WHERE  lookup_type = 'CFA_BIPUB'
AND    lookup_code = 'URL';
```

That needs DB connectivity. If this EC2 tool is the jump/proxy into the environment, the SQL can’t be run until the instance is found and the tunnel is up.

## Bottom line

This is not a SQL failure. The access tool never found a usable EC2 instance, so it panicked. Fix AWS visibility / start the expected instance, then retry.
