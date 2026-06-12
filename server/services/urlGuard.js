import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * SSRF guard for user-supplied URLs that the server will fetch (scrape, screenshot).
 * Allows only http/https to hosts that resolve exclusively to public addresses.
 *
 * Known limitation: a malicious server can still redirect a request to an internal
 * address after this check passes (redirect-based SSRF), and DNS answers can change
 * between check and use. This guard raises the bar; it is not a substitute for
 * network-level egress controls.
 */

const PRIVATE_V4_RANGES = [
    /^0\./,                      // "this network"
    /^10\./,                     // RFC 1918
    /^127\./,                    // loopback
    /^169\.254\./,               // link-local / cloud metadata
    /^172\.(1[6-9]|2\d|3[01])\./, // RFC 1918
    /^192\.168\./,               // RFC 1918
    /^192\.0\.0\./,              // IETF protocol assignments
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT 100.64/10
    /^255\.255\.255\.255$/,      // broadcast
];

const isPrivateV4 = (ip) => PRIVATE_V4_RANGES.some(r => r.test(ip));

export function isPrivateAddress(ip) {
    if (net.isIPv4(ip)) return isPrivateV4(ip);
    if (net.isIPv6(ip)) {
        const lower = ip.toLowerCase();
        if (lower === '::' || lower === '::1') return true;            // unspecified / loopback
        if (/^f[cd]/.test(lower)) return true;                          // fc00::/7 unique local
        if (/^fe[89ab]/.test(lower)) return true;                       // fe80::/10 link-local
        const v4Mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);  // v4-mapped
        if (v4Mapped) return isPrivateV4(v4Mapped[1]);
        return false;
    }
    // Not a recognizable IP — treat as private to fail closed
    return true;
}

const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain']);

/**
 * Throws when the URL is not a safe, public http(s) target. Resolves to the
 * parsed URL otherwise.
 */
export async function assertPublicHttpUrl(urlString) {
    let url;
    try {
        url = new URL(urlString);
    } catch {
        throw new Error('Invalid URL format');
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('URL protocol not allowed');
    }

    const hostname = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

    if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase()) || hostname.toLowerCase().endsWith('.localhost')) {
        throw new Error('URL host not allowed');
    }

    // Literal IP: check directly, no DNS needed
    if (net.isIP(hostname)) {
        if (isPrivateAddress(hostname)) throw new Error('URL host not allowed');
        return url;
    }

    let addresses;
    try {
        addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    } catch {
        throw new Error('URL host did not resolve');
    }

    if (!addresses.length || addresses.some(a => isPrivateAddress(a.address))) {
        throw new Error('URL host not allowed');
    }

    return url;
}
