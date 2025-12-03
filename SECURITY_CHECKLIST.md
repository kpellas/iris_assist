# Production Security Checklist

## Required Secrets & Config
- Set `JWT_SECRET` (32+ random bytes, hex) and `TOKEN_ENCRYPTION_KEY` (64 hex chars) in the runtime environment.
- Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` to the deployed HTTPS URL.
- If using AWS storage for tokens, set `AWS_REGION` and `USE_AWS_SECRETS=true` (optionally `USE_SSM=true`).
- Set `ALLOWED_EMAIL_DOMAINS` to restrict outbound email recipients.

## Networking & TLS
- Serve the backend behind HTTPS (or a TLS-terminating proxy/API Gateway).
- Update CORS allowed origins to your production hosts (not just localhost).

## Authentication & Authorization
- Replace the placeholder `/api/auth/login` with real user authentication (e.g., passwordless/OIDC) backed by your user store.
- Enforce scopes per user when issuing JWTs (e.g., `drive.read`, `drive.write`, `gmail.read`, `gmail.send`).

## Token Storage & Lifecycle
- Ensure `.tokens.encrypted` (local fallback) stays gitignored; prefer AWS SSM/Secrets Manager in production.
- Validate file permissions (600) if using local storage.
- Plan token refresh/rotation cadence and monitor expiry errors.

## Email & Drive Safeguards
- Keep rate limits enabled; consider moving to a shared limiter (API Gateway/Redis) if running multiple instances.
- Keep recipient validation on; set domain allowlist as needed.
- Log and review audit events for send/create actions in a durable sink (CloudWatch/Datadog/SIEM).

## Deploy & Test
- Run `npm run db:migrate` and confirm pgvector extension on prod DB.
- End-to-end test OAuth with PKCE/state in the deployed environment.
- Verify health/auth checks, and exercise Google endpoints with valid JWTs.
