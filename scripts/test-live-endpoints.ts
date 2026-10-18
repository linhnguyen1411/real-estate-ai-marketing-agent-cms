async function main() {
  console.log('Testing login...');
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'linhnguyen1411@gmail.com',
      password: 'admin123',
      portal: 'member'
    })
  });
  const loginData = await loginRes.json();
  console.log('Login status:', loginRes.status, 'data status:', loginData.status, 'role:', loginData.data?.user?.role);

  const token = loginData.data?.token;

  console.log('\nTesting CMS internal chat (/api/ai/chat) with token...');
  const cmsChatRes = await fetch('http://localhost:3000/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      message: 'làm sao để đăng tin'
    })
  });
  const cmsChatData = await cmsChatRes.json();
  console.log('CMS Chat status:', cmsChatRes.status);
  console.log('CMS Chat response snippet:\n', String(cmsChatData.data || '').slice(0, 300));

  console.log('\nTesting Public chat (/api/public/chat)...');
  // First create or get guest session
  const guestRes = await fetch('http://localhost:3000/api/public/chat/guest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Khách Test',
      phone: '0905123456'
    })
  });
  const guestData = await guestRes.json();
  const sessionId = guestData.data?.session_id;
  console.log('Guest session created:', sessionId);

  const pubChatRes = await fetch('http://localhost:3000/api/public/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      message: 'làm sao để đăng tin'
    })
  });
  const pubChatData = await pubChatRes.json();
  console.log('Public Chat status:', pubChatRes.status);
  console.log('Public Chat response snippet:\n', String(pubChatData.data || '').slice(0, 300));
}

main().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
