import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:dns/promises', () => ({
    default: { lookup: vi.fn() },
}));

import dns from 'node:dns/promises';
import { assertPublicHttpUrl, isPrivateAddress } from './urlGuard.js';

describe('isPrivateAddress', () => {
    it.each([
        '127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.1',
        '169.254.169.254', '0.0.0.0', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1',
        '::ffff:10.0.0.1', '::ffff:192.168.1.1',
    ])('flags %s as private', (ip) => {
        expect(isPrivateAddress(ip)).toBe(true);
    });

    it.each(['93.184.216.34', '142.250.180.4', '2606:2800:220:1:248:1893:25c8:1946'])(
        'allows public %s', (ip) => {
            expect(isPrivateAddress(ip)).toBe(false);
        }
    );
});

describe('assertPublicHttpUrl', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        dns.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    });

    it('accepts a public https URL', async () => {
        await expect(assertPublicHttpUrl('https://example.com/article')).resolves.toBeTruthy();
    });

    it('rejects non-http(s) protocols', async () => {
        await expect(assertPublicHttpUrl('file:///etc/passwd')).rejects.toThrow(/not allowed/i);
        await expect(assertPublicHttpUrl('ftp://example.com/x')).rejects.toThrow(/not allowed/i);
    });

    it('rejects malformed URLs', async () => {
        await expect(assertPublicHttpUrl('not a url')).rejects.toThrow(/invalid/i);
    });

    it('rejects literal private/loopback IPs without a DNS lookup', async () => {
        await expect(assertPublicHttpUrl('http://127.0.0.1:3001/api')).rejects.toThrow(/not allowed/i);
        await expect(assertPublicHttpUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(/not allowed/i);
        await expect(assertPublicHttpUrl('http://[::1]/')).rejects.toThrow(/not allowed/i);
        expect(dns.lookup).not.toHaveBeenCalled();
    });

    it('rejects localhost by name', async () => {
        await expect(assertPublicHttpUrl('http://localhost:3001/')).rejects.toThrow(/not allowed/i);
    });

    it('rejects hostnames that resolve to a private address', async () => {
        dns.lookup.mockResolvedValue([
            { address: '93.184.216.34', family: 4 },
            { address: '10.0.0.7', family: 4 }, // DNS-rebinding style answer
        ]);
        await expect(assertPublicHttpUrl('https://evil.example.com/')).rejects.toThrow(/not allowed/i);
    });

    it('rejects hostnames that fail to resolve', async () => {
        dns.lookup.mockRejectedValue(new Error('ENOTFOUND'));
        await expect(assertPublicHttpUrl('https://does-not-exist.invalid/')).rejects.toThrow(/resolve/i);
    });
});
