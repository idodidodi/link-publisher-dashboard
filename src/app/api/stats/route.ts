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

async function fetchTrafficStarsAdvertiserStats(apiToken: string, dateFrom: string, dateTo: string) {
    return new Promise((resolve) => {
        const data = JSON.stringify({ date_from: dateFrom, date_to: dateTo });

        const options = {
            hostname: 'api.trafficstars.com',
            path: '/v1.1/advertiser/custom/report/by-day',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => { responseData += chunk; });
            res.on('end', () => {
                if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                    console.error('TrafficStars Advertiser API failed:', res.statusCode, responseData);
                    resolve(null);
                    return;
                }
                try {
                    const parsed = JSON.parse(responseData);
                    if (Array.isArray(parsed)) {
                        const result = parsed.map((item: any) => ({
                            ddate: item.day,
                            impressions: parseInt(item.impressions) || 0,
                            clicks: parseInt(item.clicks) || 0,
                            cost: parseFloat(item.amount) || 0,
                            ctr: parseFloat(item.ctr) || 0,
                            cpm: parseFloat(item.ecpm) || 0
                        }));
                        resolve({ data: { result }, role: 'Advertiser' });
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    console.error('Error parsing TrafficStars Advertiser stats:', e);
                    resolve(null);
                }
            });
        });

        req.on('error', (e) => {
            console.error('Error fetching TrafficStars Advertiser stats:', e);
            resolve(null);
        });

        req.write(data);
        req.end();
    });
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
                // Using rtb_pub_revenue as the revenue metric from ZoneReports
                results[row.date] = parseFloat(row.rtb_pub_revenue) || 0;
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
            topId: process.env.TRAFFICSHOP_COM_TOP_PUBLISHER_ID,
            blastId: process.env.TRAFFICSHOP_COM_BLAST_PUBLISHER_ID,
            // apiToken: process.env.TRAFFICSHOP_COM_API_TOKEN
        },
        TrafficStars: {
            topId: process.env.TRAFFICSTARS_TOP_PUBLISHER_ID,
            blastId: process.env.TRAFFICSTARS_BLAST_PUBLISHER_ID,
            apiToken: process.env.TRAFFICSTARS_API_TOKEN
        },
        Traforama: {
            topId: process.env.TRAFORAMA_ADSPYGLASS_TOP_PUBLISHER_ID,
            blastId: process.env.TRAFORAMA_BLAST_PUBLISHER_ID,
            // apiToken: process.env.TRAFORAMA_API_TOKEN
        },
        Twinred: {
            topId: process.env.TWINRED_TOP_PUBLISHER_ID,
            blastId: process.env.TWINRED_BLAST_PUBLISHER_ID,
            // apiToken: process.env.TWINRED_API_TOKEN
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

    const [platformStats, blastStats, topsStats, blastZoneStats] = await Promise.all([
        (async () => {
            if (publisherName === 'Adsterra' && 'apiToken' in pubConfig && pubConfig.apiToken) {
                return fetchAdsterraStats(pubConfig.apiToken as string, dateFrom, dateTo);
            }
            if (publisherName === 'TrafficStars' && 'apiToken' in pubConfig && pubConfig.apiToken) {
                return fetchTrafficStarsAdvertiserStats(pubConfig.apiToken as string, dateFrom, dateTo);
            }

            let sessionToken = null;
            if ('apiToken' in pubConfig && pubConfig.apiToken) {
                sessionToken = await getSessionToken(pubConfig.apiToken as string);
            }
            return sessionToken ? fetchStats(sessionToken, dateFrom, dateTo) : null;
        })(),
        fetchBlastStats((pubConfig as any).blastId, dateFrom, dateTo),
        fetchTopsStats(pubConfig.topId, dateFrom, dateTo),
        ['TrafficStars', 'Traforama', 'Twinred'].includes(publisherName) ? fetchBlastZoneStats((pubConfig as any).blastId, dateFrom, dateTo) : Promise.resolve(null)
    ]);

    let resultItems = platformStats?.data?.result || [];

    // If we have no exoStats (no Publisher Platform API like for Adsterra), we generate the base dates
    // from 'dateFrom' to 'dateTo'.
    if (resultItems.length === 0) {
        let curr = new Date(dateFrom);
        const end = new Date(dateTo);
        while (curr <= end) {
            resultItems.push({
                ddate: curr.toISOString().split('T')[0],
                impressions: 0,
                clicks: 0,
                cost: null,
                ctr: 0,
                cpm: 0
            });
            curr.setDate(curr.getDate() + 1);
        }
    }

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
