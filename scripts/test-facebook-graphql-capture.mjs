#!/usr/bin/env node
import {
  buildGroupPostPermalink,
  extractPostIdentityNear,
  graphqlCaptureToFacebookPost,
} from '../server/agent-worker/facebook/facebookGraphqlCapture.ts';

let pass = 0;
let fail = 0;
function assert(cond, label) {
  if (cond) {
    pass += 1;
    console.log('  ✓', label);
  } else {
    fail += 1;
    console.error('  ✗', label);
  }
}

const groupUrl = 'https://www.facebook.com/groups/muabanbatdongsantaidanang';

console.log('\nGraphQL permalink extraction');
{
  const body = [
    '{"story":{"message":{"text":"',
    'Khách tài chính 6 tỷ tìm nhà hoà cường Zalo 0905123456',
    '"},"feedback":{"id":"ZmVlZGJhY2s6MTAxNjI1NjE5NzkyOTA4MDY="},"post_id":"10162561979290806"}}',
  ].join('');
  const idx = body.indexOf('"text"');
  const id = extractPostIdentityNear(body, idx, groupUrl);
  assert(id.postId === '10162561979290806', `post_id extracted (got ${id.postId})`);
  assert(
    id.permalink === `${groupUrl}/posts/10162561979290806/`,
    `permalink built (got ${id.permalink})`,
  );
}

{
  const body =
    '{"x":{"text":"Cần nhà Mỹ Khê Zalo 0774444735 ok sát biển"},"photo":{"url":"https:\\/\\/www.facebook.com\\/photo.php?fbid=1&set=gm.10162549382940806&type=3"}}';
  const idx = body.indexOf('"text"');
  const id = extractPostIdentityNear(body, idx, groupUrl);
  assert(id.postId === '10162549382940806', `gm. post id extracted (got ${id.postId})`);
}

{
  const permalink = buildGroupPostPermalink(groupUrl, '1234567890');
  assert(permalink.endsWith('/posts/1234567890/'), 'buildGroupPostPermalink format');
}

{
  const mapped = graphqlCaptureToFacebookPost({
    externalId: '10162561979290806',
    contentText: 'Tài chính 15 quay đầu cần nhà ok sát biển Mỹ Khê Zalo 077-4444-735',
    canonicalUrl: `${groupUrl}/posts/10162561979290806/`,
    authorName: null,
    permalinkResolved: true,
  });
  assert(mapped.canonicalUrl.includes('/posts/10162561979290806/'), 'mapper keeps real permalink');
  assert(mapped.rawData.permalinkResolved === true, 'mapper flags permalinkResolved');
}

console.log(`\nResults: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
