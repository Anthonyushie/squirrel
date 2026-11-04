// End to end on the test mint for the three newest pieces: a streamed nut's memo, the creator's
// signed receipt, and cashing redeemed sats out over Lightning. Locks two 8-sat nuts to a fresh
// creator key (one gifted, one streamed), checks receipts both ways, redeems both, then melts them
// to pay a Lightning invoice. Never publishes. Run: stage0/node_modules/.bin/tsx scripts/check-receipt-cashout.mts
import { MeltQuoteState, MintQuoteState, Wallet, getEncodedToken, getTokenMetadata } from '@cashu/cashu-ts';
import { redeemTogether } from '../lib/creator';
import { decodeMemo, encodeMemo, isGiftMemo } from '../lib/gift';
import { newNostrKeypair, newP2PKKeypair } from '../lib/keys';
import { buildNutzapEvent, nutzapContent } from '../lib/nutzap';
import { receiptValid, signReceipt } from '../lib/receipt';
import { nutzapToken } from '../lib/receive';
import { TEST_MINT } from '../lib/settings';
import { nutId } from '../lib/verify';

const results: [string, boolean][] = [];
const check = (name: string, ok: boolean) => results.push([name, ok]);
const sum = (ps: { amount: { toNumber(): number } }[]) => ps.reduce((a, p) => a + p.amount.toNumber(), 0);

const creator = newP2PKKeypair();
const stranger = newP2PKKeypair();
const refund = newP2PKKeypair();
const guid = 'a07a0e11-6874-41bf-ad3c-c9c722e62aa6';

const wallet = new Wallet(TEST_MINT);
await wallet.loadMint();
const keysetIds = wallet.keyChain.getKeysets().map((k) => k.id);

async function fund(amount: number) {
	const quote = await wallet.createMintQuoteBolt11(amount);
	for (let i = 0; (await wallet.checkMintQuoteBolt11(quote.quote)).state !== MintQuoteState.PAID; i++) {
		if (i > 30) throw new Error('quote never paid');
		await new Promise((r) => setTimeout(r, 1000));
	}
	return wallet.mintProofsBolt11(amount, quote.quote);
}

const locktime = Math.floor(Date.now() / 1000) + 30 * 86400;
const { send: nuts } = await wallet.ops.send(16, await fund(24)).asP2PK({ pubkey: creator.pub, locktime, refundKeys: [refund.pub] }, [8, 8]).run();

// Streaming: the memo marks the nut, and it survives the nutzap round trip.
const gifted = getEncodedToken({ mint: TEST_MINT, unit: 'sat', proofs: [nuts[0]], memo: encodeMemo(guid, 600, 'Great bit') });
const streamed = getEncodedToken({ mint: TEST_MINT, unit: 'sat', proofs: [nuts[1]], memo: encodeMemo(guid, 900, '', true) });
check('gift memo is not marked streamed', decodeMemo(getTokenMetadata(gifted).memo).streamed === undefined);
const event = buildNutzapEvent({ token: streamed, keysetIds, recipientHex: newNostrKeypair().pub, content: 'x', senderPrivHex: newNostrKeypair().priv, episodeGuid: guid });
const back = decodeMemo(getTokenMetadata(nutzapToken(event)).memo);
check('streamed memo is a Squirrel memo and rides in the nutzap tag', isGiftMemo(getTokenMetadata(streamed).memo) && back.streamed === true && back.seconds === 900);
check(
	'streamed nutzap says so in its content',
	nutzapContent({ streamed: true, seconds: 900, episodeTitle: 'Ep', message: '' } as Parameters<typeof nutzapContent>[0]).startsWith('Streamed while listening'),
);

// Receipts: the creator signs the nut id; only the creator's key verifies.
const id = nutId(nuts[0].secret);
const [tag, rid, sig] = signReceipt(id, creator.priv).split('|');
check('receipt is short enough for a quick scan', signReceipt(id, creator.priv).length < 220);
check('receipt verifies against the lock key the jar holds', tag === 'sqr1' && rid === id && receiptValid(id, sig, creator.pub));
check('receipt signed by another key is rejected', !receiptValid(id, signReceipt(id, stranger.priv).split('|')[2], creator.pub));
check('receipt for a different nut is rejected', !receiptValid(nutId(nuts[1].secret), sig, creator.pub));

// Redeem, then cash out: pay an invoice from the same mint, as the cash-out sheet does.
const redeemed = await redeemTogether(wallet, TEST_MINT, [gifted, streamed], creator.priv);
const available = sum(redeemed);
// The test mint pays its own invoices after a short random delay, and then refuses to melt to them
// ("Invoice already paid"), so a fresh invoice gets a few tries. Real invoices come from elsewhere.
const inputFee = 2 * wallet.getFeesForProofs(redeemed).toNumber();
let held = redeemed;
let outcome: { melt: Awaited<ReturnType<typeof wallet.createMeltQuoteBolt11>>; paid: Awaited<ReturnType<typeof wallet.meltProofsBolt11>> } | undefined;
for (let attempt = 0; attempt < 4 && !outcome; attempt++) {
	const melt = await wallet.createMeltQuoteBolt11((await wallet.createMintQuoteBolt11(5)).request);
	const { keep, send } = await wallet.send(melt.amount.add(melt.fee_reserve), held, { includeFees: true });
	try {
		outcome = { melt, paid: await wallet.meltProofsBolt11(melt, send) };
		held = keep;
	} catch (e) {
		if (!/already paid/i.test((e as Error).message)) throw e;
		held = [...keep, ...send];
	}
}
if (!outcome) throw new Error('every test invoice paid itself before the melt; run again');
const need = outcome.melt.amount.toNumber() + outcome.melt.fee_reserve.toNumber() + inputFee;
check(`melt quote for 5 sats fits in ${available} redeemed (needs at most ${need})`, outcome.melt.amount.toNumber() === 5 && need <= available);
check('melt is paid', outcome.paid.quote.state === MeltQuoteState.PAID);
const left = sum(held) + sum(outcome.paid.change);
check(`spent no more than the quote said (${available - left} of at most ${need})`, available - left <= need);

for (const [name, ok] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
console.log(`\nRedeemed ${available} sats, paid a 5-sat invoice, ${left} sats left. Nothing was published.`);
if (!results.every(([, ok]) => ok)) process.exit(1);
