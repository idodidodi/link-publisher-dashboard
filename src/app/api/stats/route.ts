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
    const cached = cacheKey === 'blast' ? cachedTwinredBlastToken : cachedTwinredTopToken;
    if (cached && Date.now() < cached.expiresAt) {
        return cached.token;
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
        else cachedTwinredTopToken = entry;

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
            clientSecret: decodeB64(process.env.TWINRED_BLAST_CLIENT_SECRET_B64),
            advId: process.env.TWINRED_BLAST_ADVERTISER_ID,
        }
    };

    const pubConfig = PUBLISHERS[publisherName as keyof typeof PUBLISHERS] || PUBLISHERS['Exoclick'];

    const now = new Date();
    const defaultDateTo = now.toISOString().split('T')[0];
    const dateFromDate = new Date();
    dateFromDate.setDate(now.getDate() - 14);
    const defaultDateFrom = dateFromDate.toISOString().split('T')[0];

    const dateFrom = from || defaultDateFrom;
    const dateTo = to || defaultDateTo;

    const [platformStats, blastStats, topsStats, blastZoneStats]: any[] = await Promise.all([
        (async () => {
            if (publisherName === 'Adsterra' && 'apiToken' in pubConfig && pubConfig.apiToken) {
                return fetchAdsterraStats(pubConfig.apiToken as string, dateFrom, dateTo);
            }
            if (publisherName === 'TrafficStars' && 'refreshToken' in pubConfig && pubConfig.refreshToken) {
                const tsToken = await getTrafficStarsSessionToken(pubConfig.refreshToken as string);
                if (tsToken) {
                    return fetchTrafficStarsAdvertiserStats(tsToken, dateFrom, dateTo);
                }
                return null;
            }
            if (publisherName === 'TrafficShop' && 'apiToken' in pubConfig && pubConfig.apiToken) {
                return fetchTrafficShopStats(pubConfig.apiToken as string, dateFrom, dateTo);
            }
            if (publisherName.startsWith('Twinred') && 'clientId' in pubConfig && pubConfig.clientId) {
                const cacheKey = publisherName.endsWith('Blast') ? 'blast' : 'top';
                const token = await getTwinredSessionToken(pubConfig.clientId as string, pubConfig.clientSecret as string, cacheKey);
                return token && pubConfig.advId ? fetchTwinredAdvertiserStats(token, pubConfig.advId as string, dateFrom, dateTo) : null;
            }

            let sessionToken = null;
            if ('apiToken' in pubConfig && pubConfig.apiToken) {
                sessionToken = await getSessionToken(pubConfig.apiToken as string);
            }
            return sessionToken ? fetchStats(sessionToken, dateFrom, dateTo) : null;
        })(),
        fetchBlastStats((pubConfig as any).blastId, dateFrom, dateTo),
        fetchTopsStats((pubConfig as any).topId, dateFrom, dateTo),
        ['TrafficStars', 'Traforama', 'Twinred Blast'].includes(publisherName) ? fetchBlastZoneStats((pubConfig as any).blastId, dateFrom, dateTo) : Promise.resolve(null)
    ]);

    // Create a base map with all dates in the range
    const itemsMap: Record<string, any> = {};
    let curr = new Date(dateFrom);
    const end = new Date(dateTo);
    while (curr <= end) {
        const d = curr.toISOString().split('T')[0];
        itemsMap[d] = {
            ddate: d,
            impressions: 0,
            clicks: 0,
            cost: null,
            ctr: 0,
            cpm: 0
        };
        curr.setDate(curr.getDate() + 1);
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

    return NextResponse.json({
        data: { result: resultItems },
        role: platformStats?.role || 'N/A'
    });
}
