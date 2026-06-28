import { parseFacebookWebhookPayload } from '../server/facebook/webhookParser.ts';
import { analyzeIntent } from '../server/facebook/intentDetector.ts';

const messengerPayload = {
  object: 'page',
  entry: [{
    id: '123456',
    messaging: [{
      sender: { id: 'psid-001' },
      recipient: { id: '123456' },
      timestamp: Date.now(),
      message: { mid: 'm1', text: 'Cho em xin giá Symphony 5 tỷ' },
    }],
  }],
};

const commentPayload = {
  object: 'page',
  entry: [{
    id: '123456',
    changes: [{
      field: 'feed',
      value: {
        item: 'comment',
        verb: 'add',
        comment_id: 'c1',
        post_id: 'p1',
        message: 'Em quan tâm đất Mai Đăng Chơn',
        from: { id: 'user-1', name: 'Test User' },
        created_time: Math.floor(Date.now() / 1000),
      },
    }],
  }],
};

const messengerEvents = parseFacebookWebhookPayload(messengerPayload);
const commentEvents = parseFacebookWebhookPayload(commentPayload);

console.log('Messenger:', messengerEvents[0]?.kind);
console.log('Comment:', commentEvents[0]?.kind);

const intent = analyzeIntent('giá Symphony 5 tỷ', 'messenger');
console.log('Intent score:', intent.score, 'tags:', intent.tags.join(','));

if (messengerEvents[0]?.kind !== 'messenger_inbound') throw new Error('messenger parse failed');
if (commentEvents[0]?.kind !== 'page_comment') throw new Error('comment parse failed');
if (intent.score < 60) throw new Error(`expected score > 60, got ${intent.score}`);

console.log('OK');
