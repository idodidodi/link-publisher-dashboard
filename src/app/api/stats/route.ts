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

export async function GET() {
    const apiToken = process.env.TOKEN;

    if (!apiToken) {
        return NextResponse.json({ error: 'API Token not found in environment' }, { status: 500 });
    }

    const sessionToken = await getSessionToken(apiToken);
    if (!sessionToken) {
        return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const stats = await fetchStats(sessionToken);
    if (!stats) {
        return NextResponse.json({ error: 'Failed to fetch statistics' }, { status: 500 });
    }

    return NextResponse.json(stats);
}
