import { NextResponse } from 'next/server';
import https from 'https';

const API_BASE_URL = 'https://api.exoclick.com/v2';

async function getSessionToken(apiToken: string) {
    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_token: apiToken }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Login failed:', response.status, errorText);
            return null;
        }

        const data = await response.json();
        return data.token;
    } catch (err) {
        console.error('Error in getSessionToken:', err);
        return null;
    }
}

async function fetchStats(sessionToken: string, dateFrom: string, dateTo: string) {
    const headers = {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
    };

    const params = new URLSearchParams({
        'date-from': dateFrom,
        'date-to': dateTo,
    });

    try {
        // Try Advertiser first
        let role = 'Advertiser';
        let response = await fetch(`${API_BASE_URL}/statistics/a/date?${params.toString()}`, {
            headers,
        });

        if (!response.ok) {
            // Try Publisher
            role = 'Publisher';
            response = await fetch(`${API_BASE_URL}/statistics/p/date?${params.toString()}`, {
                headers,
            });
        }

        if (!response.ok) {
            console.error('Failed to fetch stats from both endpoints');
            return null;
        }

        const data = await response.json();
        return { data, role };
    } catch (err) {
        console.error('Error in fetchStats:', err);
        return null;
    }
}

async function fetchAdsterraStats(apiKey: string, dateFrom: string, dateTo: string) {
    const url = `https://api3.adsterratools.com/advertiser/stats.json?start_date=${dateFrom}&finish_date=${dateTo}&group_by[]=date`;
    try {
        const response = await fetch(url, {
            headers: {
                'X-API-Key': apiKey,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('Adsterra API failed:', response.status);
            return null;
        }
        const data = await response.json();
        // Adsterra advertiser stats grouped by date returns an object with an 'items' array
        const items = data?.items || [];
        const result = items.map((item: any) => ({
            ddate: item.date,
            impressions: parseInt(item.impressions) || 0,
            clicks: parseInt(item.clicks) || 0,
            cost: parseFloat(item.spent) || 0,
            ctr: parseFloat(item.ctr) || 0,
            cpm: parseFloat(item.cpm) || 0
        }));

        return { data: { result }, role: 'Advertiser' };
    } catch (err) {
        console.error('Error in fetchAdsterraStats:', err);
        return null;
    }
}

let cachedTrafficStarsToken: { token: string, expiresAt: number } | null = null;
let cachedTwinredBlastToken: { token: string, expiresAt: number } | null = null;
let cachedTwinredTopToken: { token: string, expiresAt: number } | null = null;

const dayStatsCache = new Map<string, { item: any, role: string, cachedAt: number }>();
const DAY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getDaysInRange(from: string, to: string): string[] {
    const days: string[] = [];
    let c = new Date(from + 'T00:00:00Z');
    const e = new Date(to + 'T00:00:00Z');
    while (c <= e) {
        days.push(c.toISOString().split('T')[0]);
        c.setUTCDate(c.getUTCDate() + 1);
    }
    return days;
}

// Fields expected to be non-null for a day to be considered complete, per publisher
const PUBLISHER_EXPECTED_FIELDS: Record<string, string[]> = {
    Adsterra:      ['cost', 'topsRevenue', 'blastRevenue'],
    Exoclick:      ['cost', 'topsRevenue', 'blastRevenue'],
    Rollerads:     ['topsRevenue', 'blastRevenue'],
    TrafficShop:   ['cost', 'topsRevenue', 'blastRevenue'],
    TrafficStars:  ['cost', 'topsRevenue', 'blastRevenue', 'blastZoneRevenue'],
    Traforama:     ['topsRevenue', 'blastRevenue', 'blastZoneRevenue'],
    'Twinred Top': ['cost', 'topsRevenue'],
    'Twinred Blast': ['cost', 'blastRevenue', 'blastZoneRevenue'],
};

function isItemCacheable(item: any, publisherName: string): boolean {
    const expectedFields = PUBLISHER_EXPECTED_FIELDS[publisherName] ?? [];
    const nullExpectedFields = Object.entries(item)
        .filter(([field, value]) => value == null && expectedFields.includes(field))
        .map(([field]) => field);

    if (nullExpectedFields.length > 0) {
        console.log(`[Day Cache] NOT cacheable ${publisherName} ${item.ddate}: missing expected fields: ${nullExpectedFields.join(', ')}`);
        return false;
    }
    return true;
}

async function getTrafficStarsSessionToken(refreshToken: string) {
    if (cachedTrafficStarsToken && Date.now() < cachedTrafficStarsToken.expiresAt) {
        return cachedTrafficStarsToken.token;
    }

    const url = 'https://api.trafficstars.com/v1/auth/token';
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });

        if (!response.ok) {
            console.error('TrafficStars auth failed:', response.status, await response.text());
            return null;
        }

        const data = await response.json();

        // Cache the token with a 5-minute safety buffer before expiration
        const expiresInMs = (data.expires_in || 86400) * 1000;
        cachedTrafficStarsToken = {
            token: data.access_token,
            expiresAt: Date.now() + expiresInMs - 300000
        };

        return data.access_token;
    } catch (err) {
        console.error('Error fetching TrafficStars session token:', err);
        return null;
    }
}

async function fetchTrafficStarsAdvertiserStats(apiToken: string, dateFrom: string, dateTo: string) {
    const url = `https://api.trafficstars.com/v1.1/advertiser/custom/report/by-day?date_from=${dateFrom}&date_to=${dateTo}`;
    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            console.error('TrafficStars Advertiser API failed:', response.status);
            return null;
        }

        const parsed = await response.json();
        if (Array.isArray(parsed)) {
            const result = parsed.map((item: any) => ({
                ddate: item.day,
                impressions: parseInt(item.impressions) || 0,
                clicks: parseInt(item.clicks) || 0,
                cost: parseFloat(item.amount) || 0,
                ctr: parseFloat(item.ctr) || 0,
                cpm: parseFloat(item.ecpm) || 0
            }));
            return { data: { result }, role: 'Advertiser' };
        }
        return null;
    } catch (err) {
        console.error('Error fetching TrafficStars Advertiser stats:', err);
        return null;
    }
}

async function fetchTrafficShopStats(apiToken: string, dateFrom: string, dateTo: string) {
    const url = `https://api.trafficshop.com/v1/advertisers/analytics?start-date=${dateFrom}&end-date=${dateTo}&dimensions=date&metrics=spent`;
    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'User-Agent': 'insomnia/12.5.0'
            }
        });

        if (!response.ok) {
            console.error('TrafficShop API failed:', response.status);
            return null;
        }

        const data = await response.json();
        const rows = data.rows || [];
        const result = rows.map((row: any) => ({
            ddate: row[0],
            cost: parseFloat(row[1]) || 0,
            impressions: 0,
            clicks: 0,
            ctr: 0,
            cpm: 0
        }));

        return { data: { result }, role: 'Advertiser' };
    } catch (err) {
        console.error('Error fetching TrafficShop stats:', err);
        return null;
    }
}

function decodeB64(encoded: string | undefined): string | undefined {
    if (!encoded) return undefined;
    return Buffer.from(encoded, 'base64').toString('utf-8');
}

async function getTwinredSessionToken(clientId: string, clientSecret: string, cacheKey: 'blast' | 'top') {
    // Top tokens are NOT cached (fresh fetch each request) to avoid stale auth issues
    if (cacheKey !== 'top') {
        const cached = cacheKey === 'blast' ? cachedTwinredBlastToken : cachedTwinredTopToken;
        if (cached && Date.now() < cached.expiresAt) {
            return cached.token;
        }
    }

    const url = 'https://control.twinred.com/api/v1/oauth2/token';
    console.log(`[Twinred Auth Debug] cacheKey=${cacheKey}, clientId length=${clientId?.length}, clientSecret length=${clientSecret?.length}, clientSecret ends with: ${clientSecret?.slice(-4)}`);

    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Twinred auth failed:', response.status, errorText);
            return null;
        }

        const data = await response.json();
        const expiresInMs = (data.expires_in || 3600) * 1000;
        const entry = {
            token: data.access_token,
            expiresAt: Date.now() + expiresInMs - 300000 // 5 min buffer
        };

        if (cacheKey === 'blast') cachedTwinredBlastToken = entry;
        // Top: no caching

        return data.access_token;
    } catch (err) {
        console.error('Error fetching Twinred session token:', err);
        return null;
    }
}

async function fetchTwinredAdvertiserStats(token: string, advertiserId: string, dateFrom: string, dateTo: string) {
    const url = `https://control.twinred.com/api/v1/stats/advertisers/${advertiserId}?startDate=${dateFrom}&endDate=${dateTo}&dimensions=date`;
    console.log(`Calling Twinred API: ${url}`);
    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Twinred API failed:', response.status, errorText);
            return null;
        }

        const data = await response.json();
        const result = data.map((item: any) => ({
            ddate: item.dimensions.date,
            cost: item.measures.cost || 0,
            impressions: item.measures.impressions || 0,
            clicks: item.measures.clicks || 0,
            ctr: item.measures.clicks && item.measures.impressions ? (item.measures.clicks / item.measures.impressions) * 100 : 0,
            cpm: item.measures.cost && item.measures.impressions ? (item.measures.cost / item.measures.impressions) * 1000 : 0
        }));

        return { data: { result }, role: 'Advertiser' };
    } catch (err) {
        console.error('Error fetching Twinred stats:', err);
        return null;
    }
}

async function fetchBlastStats(publisherId: string | undefined, dateFrom: string, dateTo: string) {
    const userToken = process.env.BLAST_SOLUTION_MEDIA_API_TOKEN;

    if (!userToken || !publisherId) {
        return null;
    }

    const blastUrl = `https://login.blastmedia.site/admin/api/FeedReports/publisher=${publisherId}/date?version=6&filters=date:${dateFrom}_${dateTo}&userToken=${userToken}&columns=date,feed_cost`;

    try {
        const response = await fetch(blastUrl);
        if (!response.ok) {
            console.error('Blast API failed:', response.status);
            return null;
        }

        const data = await response.json();
        const rows = data.response?.list?.rows || {};
        const results: Record<string, number> = {};

        for (const key in rows) {
            const row = rows[key];
            if (row.date) {
                results[row.date] = parseFloat(row.feed_cost) || 0;
            }
        }
        return results;
    } catch (err) {
        console.error('Error fetching Blast stats:', err);
        return null;
    }
}

async function fetchBlastZoneStats(publisherId: string | undefined, dateFrom: string, dateTo: string) {
    const userToken = process.env.BLAST_SOLUTION_MEDIA_API_TOKEN;

    if (!userToken || !publisherId) {
        return null;
    }

    const blastZoneUrl = `https://login.blastmedia.site/admin/api/ZoneReports/publisher=${publisherId}/date?version=6&filters=date:${dateFrom}_${dateTo}&userToken=${userToken}&range=0-40`;

    try {
        const response = await fetch(blastZoneUrl);
        if (!response.ok) {
            console.error('Blast Zone API failed:', response.status);
            return null;
        }

        const data = await response.json();
        const rows = data.response?.list?.rows || {};
        const results: Record<string, number> = {};

        for (const key in rows) {
            const row = rows[key];
            if (row.date) {
                // Using rtb_rem_cost as the remote feed revenue metric from ZoneReports
                results[row.date] = parseFloat(row.rtb_rem_cost) || 0;
            }
        }
        return results;
    } catch (err) {
        console.error('Error fetching Blast Zone stats:', err);
        return null;
    }
}

async function fetchTopsStats(publisherId: string | undefined, dateFrom: string, dateTo: string) {
    const userToken = process.env.TOPS_SOLUTION_MEDIA_API_TOKEN;

    if (!publisherId || !userToken) {
        return null;
    }

    const topsUrl = `https://login.topsolutionsmedia.com/admin/api/FeedReports/publisher=${publisherId}/date?version=6&filters=date:${dateFrom}_${dateTo}&userToken=${userToken}&columns=date,feed_cost`;

    try {
        const response = await fetch(topsUrl);
        if (!response.ok) {
            console.error('Tops API failed:', response.status);
            return null;
        }

        const data = await response.json();
        const rows = data.response?.list?.rows || {};
        const results: Record<string, number> = {};

        for (const key in rows) {
            const row = rows[key];
            if (row.date) {
                results[row.date] = parseFloat(row.feed_cost) || 0;
            }
        }
        return results;
    } catch (err) {
        console.error('Error fetching Tops stats:', err);
        return null;
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const publisherName = searchParams.get('publisher') || 'Exoclick';

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const defaultDateTo = yesterday.toISOString().split('T')[0];
    const dateFromDate = new Date(yesterday);
    dateFromDate.setDate(yesterday.getDate() - 14);
    const defaultDateFrom = dateFromDate.toISOString().split('T')[0];
    const dateFrom = from || defaultDateFrom;
    const dateTo = to || defaultDateTo;

    const host = new URL(request.url).host;

    // --- Day-level smart cache ---
    const allDays = getDaysInRange(dateFrom, dateTo);
    const cachedItems: any[] = [];
    let fetchFromIdx = allDays.length; // assume all cached
    let cachedRole = 'N/A';

    for (let i = 0; i < allDays.length; i++) {
        const dayKey = `${host}:${publisherName}:${allDays[i]}`;
        const cached = dayStatsCache.get(dayKey);
        if (cached && Date.now() - cached.cachedAt < DAY_CACHE_TTL_MS) {
            cachedItems.push(cached.item);
            cachedRole = cached.role;
        } else {
            fetchFromIdx = i;
            break;
        }
    }

    if (fetchFromIdx === allDays.length) {
        console.log(`[Day Cache] Full HIT for ${publisherName} ${dateFrom}→${dateTo}`);
        return NextResponse.json({ data: { result: cachedItems }, role: cachedRole });
    }

    const fetchFrom = allDays[fetchFromIdx];
    const fetchTo = dateTo;
    if (fetchFromIdx > 0) {
        console.log(`[Day Cache] Partial HIT: ${cachedItems.length} days cached, fetching ${fetchFrom}→${fetchTo}`);
    }

    const PUBLISHERS = {
        Adsterra: {
            topId: process.env.ADSTERRA_TOP_PUBLISHER_ID,
            blastId: process.env.ADSTERRA_BLAST_PUBLISHER_ID,
            apiToken: process.env.ADSTERRA_API_TOKEN
        },
        Exoclick: {
            topId: process.env.EXOCLICK_TOP_PUBLISHER_ID,
            blastId: process.env.EXOCLICK_BLAST_PUBLISHER_ID,
            apiToken: process.env.EXOCLICK_API_TOKEN
        },
        Rollerads: {
            topId: process.env.ROLLERADS_TOP_PUBLISHER_ID,
            blastId: process.env.ROLLERADS_BLAST_PUBLISHER_ID,
            // apiToken: process.env.ROLLERADS_API_TOKEN
        },
        TrafficShop: {
            topId: process.env.TRAFFICSHOP_TOP_PUBLISHER_ID,
            blastId: process.env.TRAFFICSHOP_BLAST_PUBLISHER_ID,
            apiToken: process.env.TRAFFICSHOP_API_TOKEN
        },
        TrafficStars: {
            topId: process.env.TRAFFICSTARS_TOP_PUBLISHER_ID,
            blastId: process.env.TRAFFICSTARS_BLAST_PUBLISHER_ID,
            refreshToken: process.env.TRAFFICSTARS_REFRESH_TOKEN
        },
        Traforama: {
            topId: process.env.TRAFORAMA_ADSPYGLASS_TOP_PUBLISHER_ID,
            blastId: process.env.TRAFORAMA_BLAST_PUBLISHER_ID,
            // apiToken: process.env.TRAFORAMA_API_TOKEN
        },
        'Twinred Top': {
            topId: process.env.TWINRED_TOP_PUBLISHER_ID,
            clientId: process.env.TWINRED_TOP_CLIENT_ID,
            clientSecret: decodeB64(process.env.TWINRED_TOP_CLIENT_SECRET_B64),
            advId: process.env.TWINRED_TOP_ADVERTISER_ID,
        },
        'Twinred Blast': {
            blastId: process.env.TWINRED_BLAST_PUBLISHER_ID,
            clientId: process.env.TWINRED_BLAST_CLIENT_ID,
            clientSecret: process.env.TWINRED_BLAST_CLIENT_SECRET,
            advId: process.env.TWINRED_BLAST_ADVERTISER_ID,
        }
    };

    const pubConfig = PUBLISHERS[publisherName as keyof typeof PUBLISHERS] || PUBLISHERS['Exoclick'];

    if (publisherName === 'Twinred Top') {
        const secret = (pubConfig as any).clientSecret;
        console.log(`[Twinred Top Debug] raw B64 env length=${process.env.TWINRED_TOP_CLIENT_SECRET_B64?.length}, decoded length=${secret?.length}, decoded ends with: ${secret?.slice(-4)}`);
    }



    const [platformStats, blastStats, topsStats, blastZoneStats]: any[] = await Promise.all([
        (async () => {
            if (publisherName === 'Adsterra' && 'apiToken' in pubConfig && pubConfig.apiToken) {
                return fetchAdsterraStats(pubConfig.apiToken as string, fetchFrom, fetchTo);
            }
            if (publisherName === 'TrafficStars' && 'refreshToken' in pubConfig && pubConfig.refreshToken) {
                const tsToken = await getTrafficStarsSessionToken(pubConfig.refreshToken as string);
                if (tsToken) {
                    return fetchTrafficStarsAdvertiserStats(tsToken, fetchFrom, fetchTo);
                }
                return null;
            }
            if (publisherName === 'TrafficShop' && 'apiToken' in pubConfig && pubConfig.apiToken) {
                return fetchTrafficShopStats(pubConfig.apiToken as string, fetchFrom, fetchTo);
            }
            if (publisherName.startsWith('Twinred') && 'clientId' in pubConfig && pubConfig.clientId) {
                const cacheKey = publisherName.endsWith('Blast') ? 'blast' : 'top';
                const token = await getTwinredSessionToken(pubConfig.clientId as string, pubConfig.clientSecret as string, cacheKey);
                return token && pubConfig.advId ? fetchTwinredAdvertiserStats(token, pubConfig.advId as string, fetchFrom, fetchTo) : null;
            }

            let sessionToken = null;
            if ('apiToken' in pubConfig && pubConfig.apiToken) {
                sessionToken = await getSessionToken(pubConfig.apiToken as string);
            }
            return sessionToken ? fetchStats(sessionToken, fetchFrom, fetchTo) : null;
        })(),
        fetchBlastStats((pubConfig as any).blastId, fetchFrom, fetchTo),
        fetchTopsStats((pubConfig as any).topId, fetchFrom, fetchTo),
        ['TrafficStars', 'Traforama', 'Twinred Blast'].includes(publisherName) ? fetchBlastZoneStats((pubConfig as any).blastId, fetchFrom, fetchTo) : Promise.resolve(null)
    ]);

    // Build itemsMap for the FETCH range only (not the full range)
    const itemsMap: Record<string, any> = {};
    let curr = new Date(fetchFrom + 'T00:00:00Z');
    const end = new Date(fetchTo + 'T00:00:00Z');
    while (curr <= end) {
        const d = curr.toISOString().split('T')[0];
        itemsMap[d] = { ddate: d, impressions: 0, clicks: 0, cost: null, ctr: 0, cpm: 0 };
        curr.setUTCDate(curr.getUTCDate() + 1);
    }

    const platformResult = (platformStats as any)?.data?.result || [];
    console.log(`Platform stats for ${publisherName}: ${platformResult.length} items found`);

    platformResult.forEach((item: any) => {
        if (itemsMap[item.ddate]) {
            itemsMap[item.ddate] = { ...itemsMap[item.ddate], ...item };
        }
    });

    let resultItems = Object.values(itemsMap);

    // Merge Blast and Tops stats into the results
    resultItems = resultItems.map((item: any) => ({
        ...item,
        blastRevenue: blastStats && blastStats[item.ddate] !== undefined ? blastStats[item.ddate] : null,
        blastZoneRevenue: blastZoneStats && blastZoneStats[item.ddate] !== undefined ? blastZoneStats[item.ddate] : null,
        topsRevenue: topsStats && topsStats[item.ddate] !== undefined ? topsStats[item.ddate] : null
    }));

    const role = platformStats?.role || 'N/A';

    // Store newly fetched days in per-day cache (skip days with all-null data)
    resultItems.forEach((item: any) => {
        if (isItemCacheable(item, publisherName)) {
            dayStatsCache.set(`${host}:${publisherName}:${item.ddate}`, { item, role, cachedAt: Date.now() });
        }
    });

    // Combine the cached prefix with the newly fetched tail
    const allItems = [...cachedItems, ...resultItems];
    console.log(`[Day Cache] Stored ${resultItems.filter((i: any) => isItemCacheable(i, publisherName)).length}/${resultItems.length} new days. Total: ${allItems.length} days`);

    return NextResponse.json({ data: { result: allItems }, role });
}
