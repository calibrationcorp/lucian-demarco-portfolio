# Lucian Portfolio Gmail contact API

Node 20+ backend. Sends website contact, chat inquiry, and consented newsletter requests via Gmail API to calibrationcorp.network@gmail.com, copying luciandemarco@icloud.com privately (Cc header). Visitors are not shown the copy address in the website UI; email headers may expose CC if a recipient ever receives a forwarded copy.

Required Render environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN. OAuth must be authorized by the Gmail account owner with gmail.send scope; configure Google Cloud OAuth consent and generate a refresh token via an authenticated authorization flow. Never commit secrets. The API rejects unrecognized Origin, validates inputs, applies basic in-memory rate limits and a honeypot; use CAPTCHA, monitoring and durable rate limiting for production traffic. Configure frontend API endpoint to the Render web-service URL after OAuth is activated.

This is an email notification backend, not a real-time two-way chat or an AI assistant. Keep a privacy notice and consent.
