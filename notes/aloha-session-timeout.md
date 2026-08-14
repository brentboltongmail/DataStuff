# Aloha / Okta session timeout

## Verdict

Yes — the Oracle drop is almost certainly the **Aloha tunnel dying**, not DataStuff. Aloha has almost no “session length” knobs of its own; your AWS/Okta temp credentials and the SSM/SSH tunnel behind Aloha do.

## What you’re running

From history / doctor:

```bash
aloha -i i-009402f3a7e0e7520 -a dcfapay.payrolldev.chick-fil-a.com:1521
```

- Alohomora **2.3.0** (`/opt/homebrew/bin/aloha`)
- Auth via **okta-aws-cli** → writes temp creds to `~/.aws/credentials` (includes `aws_session_token`)
- Account: `cfapayrolldev`, Role: `Admin`
- Config dir: `~/.alohomora` (logs only; no timeout config file)

## Aloha’s only timeout flag

| Flag | Meaning | Default |
|---|---|---|
| `-t, --timeout` | SSH `ServerAliveInterval` (keepalive seconds) | `60` |

That is **not** session lifetime. It only pings the SSH peer every N seconds. There is no Aloha setting for “keep tunnel open for N hours.”

SSH is started roughly like:

```text
ssh ... -L <local>:<host>:<port> -o ServerAliveInterval=<t> ...
```

## Evidence from your logs (`~/.alohomora/logs/`)

Several access-tools sessions end with:

```text
panic: Failed to start proxy.  (exit status 255)
```

Observed lifetimes (start → that panic):

| Started | Died | Duration |
|---|---|---|
| 13:44 | 15:42 | ~1h 58m |
| 05:19 | 07:17 | ~1h 58m |
| 11:07 | 12:59 | ~1h 52m |
| 07:17 | 08:34 | ~1h 16m |
| 13:00 | 13:26 | ~26m |

So the tunnel is dying on a ~1–2 hour pattern. That matches AWS/Okta/SSM session limits much better than DataStuff’s 30s heartbeat.

Also: `~/.aws/credentials` was rewritten at **12:59** (Okta re-login), same minute a long-running Aloha session died — re-auth / restarting Aloha is part of the loop.

## Root causes (most likely)

1. **Okta → STS session duration defaults to ~1 hour**  
   You have Okta env vars set, but **not** `OKTA_AWSCLI_SESSION_DURATION`.  
   `okta-aws-cli` supports:
   - flag: `-s, --aws-session-duration`
   - env: `OKTA_AWSCLI_SESSION_DURATION`  
   Cap is whatever IAM role `MaxSessionDuration` allows (often 1h unless raised).

2. **AWS Systems Manager Session Manager max session** (if Aloha uses SSM port-forwarding under the hood) — org default is commonly 60 minutes; can be 120+.

3. Closing / crashing the Aloha terminal — logs say to leave it up or you lose the connection.

## How to make it last longer

### 1. Request longer Okta/AWS sessions (primary)

When logging in:

```bash
okta-aws-cli web -s 14400 -z -x
# or
export OKTA_AWSCLI_SESSION_DURATION=14400   # 4 hours, if role allows
okta-aws-cli web -z -x
```

`-x` writes `x_security_token_expires` into the profile so you can see when creds die.

If Okta/IAM rejects values above 3600, ask cloud/IAM to raise the role’s **MaxSessionDuration** (and any Okta AWS app session policy).

Put this in your shell profile next to the other `OKTA_AWSCLI_*` vars:

```bash
export OKTA_AWSCLI_SESSION_DURATION=14400
```

### 2. Keep Aloha running, and restart after re-auth

After refreshing Okta creds, **restart Aloha** so the tunnel is rebuilt:

```bash
aloha -i i-009402f3a7e0e7520 -a dcfapay.payrolldev.chick-fil-a.com:1521
# optional: more aggressive SSH keepalives (won't fix STS/SSM expiry)
aloha -i i-009402f3a7e0e7520 -a dcfapay.payrolldev.chick-fil-a.com:1521 -t 30
```

Leave that terminal open.

### 3. Ask platform team about SSM max session

If tunnels still die at a fixed ~60/120 minutes even with longer STS creds, ask them to raise **Session Manager → Preferences → Maximum session duration**.

## What will *not* fix a 1h drop

- DataStuff app settings (none for session length)
- Aloha `-t` alone (keepalive only)
- Editing `/opt/homebrew/bin/aloha` (compiled binary)

## Quick checklist

1. Set `OKTA_AWSCLI_SESSION_DURATION` (or `-s`) as high as the role allows  
2. Confirm expiry with `okta-aws-cli web -z -x` and check `x_security_token_expires`  
3. Keep the Aloha window open; re-run Aloha after each Okta refresh  
4. If still ~60/120m, escalate SSM / IAM max session to platform
