# Aloha PROD: `no instance found` for `i-0cfb4644e6acc33a5`

## What you ran

```text
Connecting to: PROD - CFAPAY (cfapay.payroll.chick-fil-a.com:1521, us-east-2)
Command: AWS_REGION=us-east-2 AWS_DEFAULT_REGION=us-east-2 \
  aloha -i i-0cfb4644e6acc33a5 --region us-east-2 \
  -a cfapay.payroll.chick-fil-a.com:1521
```

## Root cause

Aloha is talking to the **wrong AWS account** for PROD.

Checked with current credentials:

| Check | Result |
|---|---|
| Identity | `arn:aws:sts::941781854884:assumed-role/Admin/bbolton` |
| `i-0cfb4644e6acc33a5` in `us-east-2` | `InvalidInstanceID.NotFound` |
| Any instances in `us-east-2` (this account) | none |
| Jump/DB hosts in `us-east-1` (this account) | DEV/TEST/UAT + `aloha` present |

So the selector set **region** correctly (`us-east-2`), but your Okta/AWS session is still the **payrolldev** account (`941781854884`). The PROD instance id lives in the **PROD payroll** account, not this one — Aloha lists EC2, finds nothing matching, panics.

## What works in this account (us-east-1)

| Instance | State | Name |
|---|---|---|
| `i-009402f3a7e0e7520` | running | aloha |
| `i-003c48cd0b53e2910` | running | dcfapay - Dev DB Server |
| `i-0b1f5fb409a896984` | running | tcfapay - Test DB Server |
| `i-0c5adc3f9adcf4ad4` | running | pcfapay - Patch DB Server |

DEV/TEST selector paths should work with this session. PROD will not until you switch accounts.

## Fix

1. Re-auth to the **PROD** AWS account / role (whatever Okta target your team uses for CFAPAY prod — not `cfapayrolldev`).
2. Confirm the instance exists:

```bash
aws sts get-caller-identity
aws ec2 describe-instances --region us-east-2 \
  --instance-ids i-0cfb4644e6acc33a5 \
  --query 'Reservations[].Instances[].[InstanceId,State.Name]' --output table
```

3. If state is `stopped`, start it; if `running`, re-run the selector’s PROD option / aloha command.

## Bottom line

Not a dead Aloha install and not a wrong region flag alone — **PROD instance is not in account `941781854884`**. Switch to the PROD AWS account, then retry.
