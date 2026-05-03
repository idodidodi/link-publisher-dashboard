const token = "cbaa27f63dbc77441f915f8d053d01ac1ceb3d5a647393bc67bb0aca6b6852a768a7d5a56e4c08b0257473f15b61f92c7fc35c78423d85ce23cd46977d5e5fa1";
const endpoints = [
  "https://api.rollerads.com/v1/statistics",
  "https://api.rollerads.com/v1/campaigns",
  "https://api.rollerads.com/advertiser/statistics",
  "https://api.rollerads.com/statistics",
  "https://api.rollerads.com/api/v1/statistics",
  "https://rollerads.com/api/v1/statistics",
  "https://api.rollerads.com/v1/advertisers/me",
];
const headersList = [
  { "Authorization": `Bearer ${token}` },
  { "Authorization": token },
  { "X-Api-Key": token },
  { "Api-Key": token }
];

async function run() {
  for (const endpoint of endpoints) {
    for (const headers of headersList) {
      try {
        const res = await fetch(endpoint, { headers, method: 'GET' });
        if (res.status !== 404) {
          console.log(`Endpoint: ${endpoint}, Headers: ${JSON.stringify(headers)}, Status: ${res.status}`);
          if (res.status === 200 || res.status === 400 || res.status === 422) {
             const text = await res.text();
             console.log(`Response: ${text}`);
          }
        }
      } catch (e) {
        // ignore
      }
    }
  }
}
run();
