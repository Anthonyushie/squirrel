# Stage 0: risky parts, proven

Node scripts run outside the app, one per risk. Results below are from 2026-11-03.

```bash
cd stage0 && npm install
MINT_URL=https://testnut.cashu.space npx tsx 01-mint-check.ts
npx tsx 02-locked-roundtrip.ts   # writes out/state.json (test keys + one unspent locked nut)
npx tsx 03-offline-verify.ts     # writes out/keys.json, then verifies with fetch disabled
npx tsx 04-qr-size.ts            # writes out/gift-*.png
npx tsx 05-nutzap-info.ts [npub] # defaults to Nodesignal
```

`out/` holds test private keys and is gitignored.

## Results

| Test | Result |
| --- | --- |
| 0.1 Mint check | PASS. `testnut.cashu.space` (cdk 0.18.1) lists NUT-11, NUT-12, NUT-07. Backup: `testnut.cashudevkit.org`. |
| 0.2 Locked round trip | PASS. Two 32-sat nuts locked to CREATOR, locktime +30d, refund LISTENER. CREATOR redeems one. The refund key is rejected before locktime by cashu-ts **and** by the mint itself (raw `/v1/swap`: `20008 P2PK spend conditions are not met`). |
| 0.3 Offline verify | PASS with `fetch` stubbed to throw. Genuine nut passes all three checks; wrong recipient, forged `C`, and expired locktime each fail the right check. |
| 0.4 QR size | 660 chars bare (QR v18, 89x89), 825 chars with a 100-char message (v20, 97x97), error correction L. **Needs a phone scan test.** |
| 0.5 Nodesignal lookup | Found. Kind 10019 with P2PK key `03e88b8f…728379` and four mints (all mainnet; all pass the 0.1 check). |

## Decisions and gotchas for Stage 1+

- **Use cashu-ts 4.x** (pinned 4.13.0). A bare `npm install` resolved 2.5.3 here, which can't load
  v2 keyset IDs (`01…`, 66 hex chars) that current cdk mints use: "No active keyset found".
- **API names in 4.x:** `new Wallet(url)`, `createMintQuoteBolt11` / `checkMintQuoteBolt11` /
  `mintProofsBolt11`, `wallet.ops.send(n, proofs).asP2PK({ pubkey, locktime, refundKeys }, [32, 32]).run()`,
  `wallet.receive({ mint, unit: 'sat', proofs }, { privkey })`. Tokens need `unit: 'sat'`.
  `proof.amount` is an `Amount` object: use `.toNumber()`; persist proofs with `serializeProofs` /
  `deserializeProofs`, not plain `JSON.stringify`.
- **Offline checks:** `parseP2PKSecret`, `getP2PKExpectedWitnessPubkeys` (must be exactly `[myKey]`,
  otherwise an extra lock key could spend it), locktime tag, and `hasValidDleq(proof, keyset, { require: true })`.
  `hasValidDleq` is removed in cashu-ts v5; its replacement is `verifyMintSignatures`.
  For the browser app, `wallet.keyChain.cache` + `loadMintFromCache` is the offline-friendly way to persist keys.
- **Fees:** testnut charges `input_fee_ppk=100`, so 1 sat per redeem: a 32-sat gift nets the creator 31.
  The "Verified · 32 sats" screen is honest about the nut; the inbox total should show what redeems.
  Minibits (one of Nodesignal's mints) charges 0.
- **Gift memo format:** the cashuB `memo` field carries `sq1|<sha256(guid)[0:8]>|<seconds>|<message ≤100>`.
  Standard field, so any Cashu wallet still reads the token.
- **noble v2:** import `@noble/curves/secp256k1.js` and `@noble/hashes/utils.js` (with `.js`).
- **Node 20** needs `ws` for nostr-tools; the browser doesn't.

## Open question: Nodesignal's real key vs. the test mint

Nodesignal's kind 10019 lists only mainnet mints. NIP-61 says senders should not nutzap on an
unlisted mint (the recipient may never claim it). So publishing testnut nutzaps to Nodesignal's
real npub would break the spec and send them unclaimable fake-sat events. Options:

1. **Demo creator for everything on testnut** (the creator phone's own key, its own 10019 if we
   publish one). Nodesignal's real 10019 is read and shown, but not paid. Matches the PRD's
   "no mainnet funds".
2. **Real sats on Minibits** (0 fees, listed by Nodesignal) for the nutzap step only, a few sats,
   with Nodesignal's OK. Strongest demo for the V4V track, but pulls in mainnet funds.
