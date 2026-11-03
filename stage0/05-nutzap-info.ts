// 0.5 Look up a creator's NIP-61 nutzap info (kind 10019): trusted mints, relays, P2PK lock key.
// Also prints their NIP-65 relays (kind 10002), where queued nutzaps should be published.
// Run: npx tsx 05-nutzap-info.ts [npub]   (defaults to Nodesignal)

import { nip19 } from 'nostr-tools';
import { SimplePool, useWebSocketImplementation } from 'nostr-tools/pool';
import WebSocket from 'ws';

useWebSocketImplementation(WebSocket); // Node 20 has no global WebSocket

// Nodesignal's npub, confirmed against the nprofile on nodesignal.space
const NPUB = process.argv[2] ?? 'npub1n0devk3h2l3rx6vmt24a3lz4hsxp7j8rn3x44jkx6daj7j8jzc0q2u02cy';
const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];

const decoded = nip19.decode(NPUB);
if (decoded.type !== 'npub') throw new Error(`not an npub: ${NPUB}`);
const pubkey = decoded.data;

const pool = new SimplePool();
const latest = (kind: number) => pool.get(RELAYS, { kinds: [kind], authors: [pubkey] }, { maxWait: 5000 });
const [profile, nutzapInfo, relayList] = await Promise.all([latest(0), latest(10019), latest(10002)]);
pool.close(RELAYS);

const name = profile ? JSON.parse(profile.content).name ?? JSON.parse(profile.content).display_name : '(no profile found)';
console.log(`Creator:  ${name}  ${NPUB}`);
console.log(`Hex:      ${pubkey}`);
console.log(`Queried:  ${RELAYS.join(', ')}`);

console.log('\nNIP-65 relays (kind 10002):');
for (const t of relayList?.tags.filter((t) => t[0] === 'r') ?? []) console.log(`  ${t[1]}${t[2] ? ` (${t[2]})` : ''}`);
if (!relayList) console.log('  none found');

if (!nutzapInfo) {
	console.log('\nno nutzap info');
	process.exit(0);
}

const tag = (n: string) => nutzapInfo.tags.filter((t) => t[0] === n);
console.log(`\nNutzap info (kind 10019, ${new Date(nutzapInfo.created_at * 1000).toISOString()}):`);
console.log(`  P2PK pubkey: ${tag('pubkey')[0]?.[1] ?? 'MISSING'}  (lock to "02" + this if it is 32 bytes)`);
for (const t of tag('mint')) console.log(`  mint:  ${t[1]}${t.length > 2 ? `  units: ${t.slice(2).join(', ')}` : ''}`);
for (const t of tag('relay')) console.log(`  relay: ${t[1]}`);
