const seoRes = await fetch('http://localhost:3000/api/public/seo');
const seo = await seoRes.json();
console.log('API status:', seoRes.status);
console.log('Hashtag keywords:', seo.data.keywords.filter(k => /[A-Z]/.test(k)).join(', '));

const htmlRes = await fetch('http://localhost:3000/');
const html = await htmlRes.text();
const match = html.match(/meta name="keywords" content="([^"]+)"/);
console.log('SSR meta found:', Boolean(match));
if (match) {
  console.log('SSR sample:', match[1].slice(0, 180));
}
