// End to end on the test mint, without Nostr: locks two 8-sat nuts to a fresh creator key, turns
// each into a Squirrel gift, builds the creator's kind 10019 and a kind 9321 per gift, reads the
// nutzaps back the way the creator's inbox does, then redeems both in a single swap.
// Never publishes. Run: stage0/node_modules/.bin/tsx scripts/check-receive.mts
import { getDecodedToken, getEncodedToken, getP2PKExpectedWitnessPubkeys, getTokenMetadata, hasValidDleq, MintQuoteState, Wallet } from '@cashu/cashu-ts';
import { verifyEvent } from 'nostr-tools';
import { redeemTogether } from '../lib/creator';
import { decodeMemo, encodeMemo, episodeRef, MEMO_TAG } from '../lib/gift';
import { newNostrKeypair, newP2PKKeypair, normalizeLockKey } from '../lib/keys';
import { buildNutzapEvent } from '../lib/nutzap';
import { buildNutzapInfoEvent, nutzapToken } from '../lib/receive';
import { TEST_MINT } from '../lib/settings';

const results: [string, boolean][] = [];
const check = (name: string, ok: boolean) => results.push([name, ok]);
const sum = (ps: { amount: { toNumber(): number } }[]) => ps.reduce((a, p) => a + p.amount.toNumber(), 0);

const creator = newP2PKKeypair();
const creatorNostr = newNostrKeypair();
const listenerNostr = newNostrKeypair();
const refund = newP2PKKeypair();
const guid = 'a07a0e11-6874-41bf-ad3c-c9c722e62aa6';

const wallet = new Wallet(TEST_MINT);
await wallet.loadMint();
const keysetIds = wallet.keyChain.getKeysets().map((k) => k.id);

// Fund and lock, as the listener's jar does.
const quote = await wallet.createMintQuoteBolt11(24);
for (let i = 0; (await wallet.checkMintQuoteBolt11(quote.quote)).state !== MintQuoteState.PAID; i++) {
	if (i > 30) throw new Error('quote never paid');
	await new Promise((r) => setTimeout(r, 1000));
}
const minted = await wallet.mintProofsBolt11(24, quote.quote);
const locktime = Math.floor(Date.now() / 1000) + 30 * 86400;
const { send: nuts } = await wallet.ops.send(16, minted).asP2PK({ pubkey: creator.pub, locktime, refundKeys: [refund.pub] }, [8, 8]).run();

// Creator's nutzap info, read back the way a listener's Settings lookup does.
const info = buildNutzapInfoEvent({ lockKey: creator.pub, mints: [TEST_MINT], relays: ['wss://relay.example'], privHex: creatorNostr.priv });
const infoTag = (n: string) => info.tags.filter((t) => t[0] === n).map((t) => t[1]);
check('10019 signature valid', verifyEvent(info));
check('10019 lock key reads back as the creator key', normalizeLockKey(infoTag('pubkey')[0]) === creator.pub);
check('10019 lists the mint exactly', infoTag('mint')[0] === TEST_MINT);

// One nutzap per gift, as publishQueued sends them.
const gifts = nuts.map((p, i) => getEncodedToken({ mint: TEST_MINT, unit: 'sat', proofs: [p], memo: encodeMemo(guid, 265 + i * 30, `Gift ${i + 1}`) }));
const events = gifts.map((token, i) =>
	buildNutzapEvent({ token, keysetIds, recipientHex: creatorNostr.pub, content: `Gift ${i + 1} (at 4:25)`, senderPrivHex: listenerNostr.priv, episodeGuid: guid }),
);
const tag = (n: string) => events[0].tags.find((t) => t[0] === n)?.[1];
check('9321 signature valid', verifyEvent(events[0]));
check('9321 carries the gift memo', tag(MEMO_TAG) === getTokenMetadata(gifts[0]).memo);
check('9321 has the NIP-73 episode id', tag('i') === `podcast:item:guid:${guid}` && tag('k') === 'podcast:item:guid');

// The creator's side: back to a token, then the same facts the offline checks rely on.
const received = events.map(nutzapToken);
const memo = decodeMemo(getTokenMetadata(received[0]).memo);
check('memo survives the nutzap: episode, moment, message', memo.episodeRef === episodeRef(guid) && memo.seconds === 265 && memo.message === 'Gift 1');
const [proof] = getDecodedToken(received[0], keysetIds).proofs;
check('same nut comes back (same secret, so the inbox dedupes QR and nutzap)', proof.secret === nuts[0].secret);
check('locked to the creator key alone', JSON.stringify(getP2PKExpectedWitnessPubkeys(proof.secret)) === JSON.stringify([creator.pub]));
check('DLEQ still valid after the round trip', hasValidDleq(proof, wallet.keyChain.getKeyset(proof.id), { require: true }));
const foreign = { ...events[0], tags: events[0].tags.filter((t) => t[0] !== MEMO_TAG), content: 'Thanks from another wallet' };
check('a non-Squirrel nutzap keeps its comment as the message', decodeMemo(getTokenMetadata(nutzapToken(foreign)).memo).message === 'Thanks from another wallet');

// Redeem both in one swap: the input fee rounds up once, not once per gift.
const fee = wallet.keyChain.getKeyset().fee;
const redeemed = await redeemTogether(wallet, TEST_MINT, received, creator.priv);
const expected = 16 - Math.ceil((2 * fee) / 1000);
check(`one swap redeems 16 sats to ${expected} (fee ${fee} ppk, paid once)`, sum(redeemed) === expected);

for (const [name, ok] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
console.log(`\nRedeemed ${sum(redeemed)} sats; one by one would have been ${16 - 2 * Math.ceil(fee / 1000)}. Nothing was published.`);
if (!results.every(([, ok]) => ok)) process.exit(1);
