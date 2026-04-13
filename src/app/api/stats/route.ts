import { NextResponse } from 'next/server';

const API_BASE_URL = 'https://api.exoclick.com/v2';

async function getSessionToken(apiToken: string) {
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
}

async function fetchBlastStats(dateFrom: string, dateTo: string) {
    const userToken = process.env.BLAST_SOLUTION_MEDIA_API_TOKEN;
    const publisherId = process.env.EXOCLICK_PUBLISHER_ID_ON_BLAST;

    if (!userToken || !publisherId) {
        console.error('Blast credentials missing');
        return null;
    }

    const blastUrl = `https://login.blastmedia.site/admin/api/FeedReports/publisher=${publisherId}/date?version=6&filters=date:${dateFrom}_${dateTo}&userToken=${userToken}&columns=date,pub_revenue`;

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
                results[row.date] = parseFloat(row.pub_revenue) || 0;
            }
        }
        return results;
    } catch (err) {
        console.error('Error fetching Blast stats:', err);
        return null;
    }
}

async function fetchTopsStats(dateFrom: string, dateTo: string) {
    const publisherId = process.env.EXOCLICK_PUBLISHER_ID_ON_TOPS;
    const userToken = process.env.TOPS_SOLUTION_MEDIA_API_TOKEN;

    if (!publisherId || !userToken) {
        console.error('Tops credentials missing');
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

    const apiToken = process.env.EXOCLICK_API_TOKEN;

    if (!apiToken) {
        return NextResponse.json({ error: 'API Token not found in environment' }, { status: 500 });
    }

    const sessionToken = await getSessionToken(apiToken);
    if (!sessionToken) {
        return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const now = new Date();
    const defaultDateTo = now.toISOString().split('T')[0];
    const dateFromDate = new Date();
    dateFromDate.setDate(now.getDate() - 14);
    const defaultDateFrom = dateFromDate.toISOString().split('T')[0];

    const dateFrom = from || defaultDateFrom;
    const dateTo = to || defaultDateTo;

    const [exoStats, blastStats, topsStats] = await Promise.all([
        fetchStats(sessionToken, dateFrom, dateTo),
        fetchBlastStats(dateFrom, dateTo),
        fetchTopsStats(dateFrom, dateTo)
    ]);

    if (!exoStats) {
        return NextResponse.json({ error: 'Failed to fetch ExoClick statistics' }, { status: 500 });
    }

    // Merge Blast and Tops stats into ExoClick results
    if (exoStats.data.result) {
        exoStats.data.result = exoStats.data.result.map((item: any) => ({
            ...item,
            blastRevenue: blastStats ? (blastStats[item.ddate] || 0) : 0,
            topsRevenue: topsStats ? (topsStats[item.ddate] || 0) : 0
        }));
    }

    return NextResponse.json(exoStats);
}
