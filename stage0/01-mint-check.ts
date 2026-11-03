// 0.1 Mint check: does MINT_URL support NUT-11 (P2PK) and NUT-12 (DLEQ)?
// Run: MINT_URL=https://testnut.cashu.space npx tsx 01-mint-check.ts

const MINT_URL = (process.env.MINT_URL ?? 'https://testnut.cashu.space').replace(/\/$/, '');

const res = await fetch(`${MINT_URL}/v1/info`);
if (!res.ok) {
	console.error(`FAIL  ${MINT_URL}/v1/info returned HTTP ${res.status}`);
	process.exit(1);
}
const info = await res.json();
const nuts: Record<string, { supported?: boolean }> = info.nuts ?? {};

console.log(`Mint:     ${info.name} (${info.version ?? 'unknown version'})`);
console.log(`URL:      ${MINT_URL}`);

let ok = true;
for (const [nut, label] of [
	['11', 'NUT-11 P2PK'],
	['12', 'NUT-12 DLEQ'],
	['7', 'NUT-07 state check'],
]) {
	const supported = nuts[nut]?.supported === true;
	console.log(`${supported ? 'PASS' : 'FAIL'}  ${label}`);
	// NUT-07 is nice to have (refund path checks spent state); 11 and 12 are required.
	if (!supported && nut !== '7') ok = false;
}

const keysets = await (await fetch(`${MINT_URL}/v1/keysets`)).json();
for (const k of keysets.keysets.filter((k: any) => k.active && k.unit === 'sat')) {
	console.log(`Keyset:   ${k.id} active, input_fee_ppk=${k.input_fee_ppk ?? 0}`);
}

if (!ok) process.exit(1);
