# Oracle session timeout (~1 hour)

## Verdict

DataStuff does **not** impose a ~1 hour database session limit. It keeps one long-lived JDBC connection and only:

- Times out **initial connect** after 5 seconds
- Probes liveness every **30 seconds** (`connection.isValid`)

An ~1 hour drop almost always comes from **Oracle profile limits**, **VPN/firewall idle kill**, or (less often) **SQLNET / network path** settings — not app pool/TTL config.

Alohomora is unrelated to this app’s JDBC path (username/password).

---

## What DataStuff does today

| Setting | Location | Value |
|---|---|---|
| Connect timeout | `jdbc/.../OracleBridge.java`, `electron/oracle.ts` | 5s |
| Heartbeat | `src/App.tsx` (`CONNECTION_HEARTBEAT_MS`) | 30s |
| Pool / idle TTL / session JWT | — | none |

On a failed heartbeat the UI force-disconnects with *“Oracle session is no longer valid”*.

---

## Likely causes (most → least)

1. **Oracle profile `IDLE_TIME` or `CONNECT_TIME` = 60** (minutes)  
   - `CONNECT_TIME` kills even with activity after N minutes  
   - `IDLE_TIME` kills after idle; heartbeat usually prevents this unless the laptop sleeps
2. **VPN / firewall / NAT / load balancer** ~3600s TCP session or idle timeout
3. **SQLNET / listener expire** settings on the DB host
4. Machine sleep (heartbeat stops; next probe finds a dead socket)

---

## How to make the session last longer

### 1. Check Oracle profile (best first step)

While connected (as your user, or ask a DBA):

```sql
SELECT u.username, u.profile, p.resource_name, p.limit
FROM   dba_users u
JOIN   dba_profiles p ON p.profile = u.profile
WHERE  u.username = USER
AND    p.resource_name IN ('IDLE_TIME', 'CONNECT_TIME', 'CPU_PER_SESSION');
```

If you lack `dba_*` access:

```sql
SELECT * FROM user_resource_limits
WHERE  resource_name IN ('IDLE_TIME', 'CONNECT_TIME');
```

Example DBA change (limits are in **minutes**):

```sql
ALTER PROFILE your_profile LIMIT IDLE_TIME 480 CONNECT_TIME UNLIMITED;
-- Resource limits must be enforced for IDLE_TIME/CONNECT_TIME to apply:
-- ALTER SYSTEM SET resource_limit = TRUE;
```

### 2. Network / VPN

Ask IT to raise idle/session timeout on the path to Oracle (often port 1521 / TCPS 2484). Keep the Mac awake while working.

### 3. App-side (optional hardening)

No config knob today. Possible code improvements:

- JDBC `oracle.net.KEEP_ALIVE=true` (and OS TCP keepalive)
- Explicit keep-alive SQL (`SELECT 1 FROM DUAL`) on an interval
- Auto-reconnect when the heartbeat fails

These help with dead sockets / NAT; they do **not** override Oracle `CONNECT_TIME`.

---

## How to tell what killed you

| Symptom / ORA | Likely cause |
|---|---|
| `ORA-02396` | Profile `IDLE_TIME` |
| Drop after ~60 min even while querying | Profile `CONNECT_TIME` or absolute VPN session limit |
| Drop after idle / laptop sleep; `ORA-03113` / `ORA-03135` | Network idle kill or sleep |
| UI: “Oracle session is no longer valid” | App heartbeat noticed the socket was already dead |

---

## Bottom line

Extend the session on the **database profile** and/or **VPN/network idle timeout**. DataStuff will keep using the connection until something outside the app closes it.
