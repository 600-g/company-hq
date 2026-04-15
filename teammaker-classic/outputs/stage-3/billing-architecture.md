# Billing Architecture

## Current MVP

- Electron app stores local billing state in `zustand persist`
- Users enter the email they used during purchase
- The app tracks three states: `free`, `pending`, `active`
- Free users can create up to 3 sessions
- Pro users can create up to 20 sessions
- Checkout opens an external Lemon Squeezy hosted URL

## Why this shape

- It gives the desktop app a concrete upgrade flow before backend work starts
- It keeps the gating logic in one place so backend verification can be added later without changing the UI contract much
- It avoids pretending local state is real payment verification

## Backend to add later

1. Lemon Squeezy webhook receiver
2. Purchase table keyed by normalized email
3. Verification endpoint: `POST /api/billing/verify-email`
4. Optional email OTP or magic link to prove ownership of the purchase email
5. Signed entitlement response for the Electron app

## Suggested future flow

1. User buys Pro in Lemon checkout
2. Lemon webhook stores purchase email and order status
3. User enters purchase email in TeamMaker
4. Backend sends one-time code or magic link
5. After verification, backend returns `active`
6. Electron app persists verified Pro state locally and refreshes gated features
