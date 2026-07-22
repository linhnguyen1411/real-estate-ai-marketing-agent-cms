import http from 'http';

http
  .get('http://127.0.0.1:3025/api/social/media/files/1784615562751-yvxq2oa4.png', res => {
    console.log('status', res.statusCode);
    console.log('headers', res.headers['content-type'], res.headers['cache-control']);
    let d = '';
    res.on('data', c => (d += c));
    res.on('end', () => console.log('body', d.slice(0, 200)));
  })
  .on('error', e => {
    console.error(e);
    process.exit(1);
  });
