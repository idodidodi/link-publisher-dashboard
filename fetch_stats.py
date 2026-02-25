import requests
import os
import json
from datetime import datetime

def load_token():
    try:
        with open('.env', 'r') as f:
            for line in f:
                if line.startswith('EXOCLICK_API_TOKEN='):
                    return line.split('=')[1].strip()
    except Exception as e:
        print(f"Error loading .env: {e}")
    return None

def get_session_token(api_token):
    url = "https://api.exoclick.com/v2/login"
    payload = {"api_token": api_token}
    
    # print(f"Logging in to get session token...")
    response = requests.post(url, json=payload)
    
    if response.status_code == 200:
        return response.json().get('token')
    else:
        print(f"Login failed: {response.status_code}")
        print(response.text)
        return None

def debug_account(session_token):
    headers = {"Authorization": f"Bearer {session_token}"}
    
    print("\n--- Debugging Account Content ---")
    # Check sites (Publisher)
    r_sites = requests.get("https://api.exoclick.com/v2/sites", headers=headers)
    if r_sites.status_code == 200:
        try:
            sites = r_sites.json()
            if isinstance(sites, dict): sites = sites.get('result', [])
            print(f"Sites found: {len(sites)}")
        except: pass
    else:
        print(f"Publisher Sites check failed: {r_sites.status_code}")
    
    # Check campaigns (Advertiser)
    r_camps = requests.get("https://api.exoclick.com/v2/campaigns", headers=headers)
    if r_camps.status_code == 200:
        try:
            camps = r_camps.json()
            if isinstance(camps, dict): camps = camps.get('result', [])
            print(f"Campaigns found: {len(camps)}")
        except: pass
    else:
        print(f"Advertiser Campaigns check failed: {r_camps.status_code}")

def get_stats(session_token):
    # API endpoints for ExoClick v2
    url_adv = "https://api.exoclick.com/v2/statistics/a/date"
    url_pub = "https://api.exoclick.com/v2/statistics/p/date"
    
    headers = {
        "Authorization": f"Bearer {session_token}",
        "Content-Type": "application/json"
    }
    
    # Default to last 14 days
    from datetime import timedelta
    date_from = (datetime.now() - timedelta(days=14)).strftime("%Y-%m-%d")
    date_to = datetime.now().strftime("%Y-%m-%d")
    
    params = {
        "date-from": date_from,
        "date-to": date_to,
    }
    
    # Try Advertiser first
    response = requests.get(url_adv, headers=headers, params=params)
    
    if response.status_code == 200:
        return response.json(), "Advertiser"
    else:
        # Try Publisher
        response = requests.get(url_pub, headers=headers, params=params)
        if response.status_code == 200:
            return response.json(), "Publisher"
        else:
            return None, None

def main():
    api_token = load_token()
    if not api_token:
        print("Token not found in .env file.")
        return
    
    session_token = get_session_token(api_token)
    if not session_token:
        return
        
    data, role = get_stats(session_token)
    if data:
        print(f"\nExoClick {role} Statistics ({data.get('request_metadata', {}).get('date-from')} to {data.get('request_metadata', {}).get('date-to')})")
        if 'result' in data:
            result = data['result']
            if not result:
                print("No data found for the current period.")
                return
                
            col_name = "Revenue" if role == "Publisher" else "Cost"
            print(f"{'Date':<12} | {'Impressions':<12} | {'Clicks':<8} | {col_name:<12}")
            print("-" * 50)
            for item in result:
                date = item.get('ddate', 'N/A')
                impr = item.get('impressions', 0)
                clicks = item.get('clicks', 0)
                val = item.get('revenue') or item.get('cost') or item.get('value') or 0
                print(f"{str(date):<12} | {impr:<12} | {clicks:<8} | {val:<12}")
            
            if 'resultTotal' in data:
                total = data['resultTotal']
                val_total = total.get('revenue') or total.get('cost') or total.get('value') or 0
                print("-" * 50)
                print(f"{'TOTAL':<12} | {total.get('impressions', 0):<12} | {total.get('clicks', 0):<8} | {val_total:<12}")
        else:
            print("Unexpected data format returned from API.")
            print(json.dumps(data, indent=2))

if __name__ == "__main__":
    main()
