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

async function fetchStats(sessionToken: string) {
    const headers = {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
    };

    const now = new Date();
    const dateTo = now.toISOString().split('T')[0];
    const dateFromDate = new Date();
    dateFromDate.setDate(now.getDate() - 14);
    const dateFrom = dateFromDate.toISOString().split('T')[0];

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
    const login = process.env.BLAST_LOGIN;
    const password = process.env.BLAST_PASSWORD;

    if (!login || !password) {
        console.error('Blast credentials missing');
        return null;
    }

    const dateParam = `${dateFrom}_${dateTo}`;
    const url = `https://login.blastmedia.site/publisher/svc?action=outcsv&login=${encodeURIComponent(login)}&password=${encodeURIComponent(password)}&channel=FeedReports&dim=date&f.date=${dateParam}&columns=date,pub_requests,pub_clicks,pub_gross,pub_net_clicks,pub_revenue&appType=XML`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error('Blast API failed:', response.status);
            return null;
        }

        const csvText = await response.text();
        const lines = csvText.trim().split('\n');
        const data: Record<string, number> = {};

        // Skip header line
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            if (cols.length >= 6) {
                const date = cols[0].trim();
                const revenue = parseFloat(cols[5]) || 0;
                data[date] = revenue;
            }
        }
        return data;
    } catch (err) {
        console.error('Error fetching Blast stats:', err);
        return null;
    }
}

export async function GET() {
    const apiToken = process.env.EXOCLICK_API_TOKEN;

    if (!apiToken) {
        return NextResponse.json({ error: 'API Token not found in environment' }, { status: 500 });
    }

    const sessionToken = await getSessionToken(apiToken);
    if (!sessionToken) {
        return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const now = new Date();
    const dateTo = now.toISOString().split('T')[0];
    const dateFromDate = new Date();
    dateFromDate.setDate(now.getDate() - 14);
    const dateFrom = dateFromDate.toISOString().split('T')[0];

    const [exoStats, blastStats] = await Promise.all([
        fetchStats(sessionToken), // Internal fetchStats uses hardcoded 14 days too
        fetchBlastStats(dateFrom, dateTo)
    ]);

    if (!exoStats) {
        return NextResponse.json({ error: 'Failed to fetch ExoClick statistics' }, { status: 500 });
    }

    // Merge Blast stats into ExoClick results
    if (blastStats && exoStats.data.result) {
        exoStats.data.result = exoStats.data.result.map((item: any) => ({
            ...item,
            blastRevenue: blastStats[item.ddate] || 0
        }));
    }

    return NextResponse.json(exoStats);
}
