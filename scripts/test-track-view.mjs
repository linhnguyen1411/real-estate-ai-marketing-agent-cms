const base = process.env.API_BASE || 'http://localhost:3000';

async function main() {
  const trackRes = await fetch(`${base}/api/public/track-view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'property', propertyId: 'p-1' })
  });
  console.log('track', trackRes.status, await trackRes.json());

  const propsRes = await fetch(`${base}/api/public/properties`);
  const propsJson = await propsRes.json();
  console.log('p-1 views', propsJson.data.find((p) => p.id === 'p-1')?.public_view_count);
}

main().catch(console.error);
