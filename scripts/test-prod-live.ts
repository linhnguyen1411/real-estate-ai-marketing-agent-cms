async function testProduction() {
  console.log('--- 1. Testing Production Login from /dang-nhap (portal: member) ---');
  const loginRes = await fetch('https://bdsdanang.site/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'owner@example.com',
      password: 'admin123',
      portal: 'member'
    })
  });
  const loginData = await loginRes.json();
  console.log('Prod Login Status Code:', loginRes.status);
  console.log('Prod Login Response Status:', loginData.status);
  console.log('User Role:', loginData.data?.user?.role);
  console.log('Token Received:', Boolean(loginData.data?.token));

  const token = loginData.data?.token;

  console.log('\n--- 2. Testing Internal CMS Chatbot (/api/ai/chat) on Production ---');
  if (token) {
    const cmsChatRes = await fetch('https://bdsdanang.site/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        message: 'Làm sao để đăng một tin bất động sản mới lên sàn bdsdanang.site?'
      })
    });
    const cmsChatData = await cmsChatRes.json();
    console.log('CMS Chat Status:', cmsChatRes.status);
    console.log('CMS Chat Response:\n', cmsChatData.data);
  }

  console.log('\n--- 3. Testing Public Visitor Chatbot (/api/public/chat) on Production ---');
  const guestRes = await fetch('https://bdsdanang.site/api/public/chat/guest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Khách Kiểm Thử Live',
      phone: '0905111222'
    })
  });
  const guestData = await guestRes.json();
  const sessionId = guestData.data?.session_id;

  const pubChatRes = await fetch('https://bdsdanang.site/api/public/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      message: 'Làm sao để đăng tin bất động sản?'
    })
  });
  const pubChatData = await pubChatRes.json();
  console.log('Public Chat Status:', pubChatRes.status);
  console.log('Public Chat Response:\n', pubChatData.data);
}

testProduction().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
