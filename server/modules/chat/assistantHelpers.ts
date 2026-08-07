import type { Request } from 'express';
import type { AutomationTask, Customer, InboxMessage, Post, Property } from '../../../src/types';
import { getAuthUser, scopeCollection } from '../auth/authAccess';
import {
  compactCustomer,
  compactProperty,
  detectQueryIntent,
  extractBudget,
  extractQueryTokens,
  rankProperties,
  textScore,
} from '../public-site/publicChatHelpers';

export function buildAssistantDbContext(db: any, req: Request, message: string) {
  const tokens = extractQueryTokens(message);
  const budget = extractBudget(message);
  const intent = detectQueryIntent(message);
  const customers = scopeCollection<Customer>(db.customers, req);
  const properties = scopeCollection<Property>(db.properties, req);
  const posts = scopeCollection<Post>(db.posts, req);
  const inbox = scopeCollection<InboxMessage>(db.inbox, req);
  const automations = scopeCollection<AutomationTask>(db.automations, req);
  const user = getAuthUser(req);
  const generatedContents = (db.generated_contents || []).filter((item: any) => {
    if (user.role === 'owner') return true;
    return item.company_id === user.company_id;
  });

  const rank = <T extends any>(items: T[], fallbackSort?: (a: T, b: T) => number) => items
    .map(item => ({ item, score: textScore(item, tokens) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return fallbackSort ? fallbackSort(a.item, b.item) : 0;
    })
    .map(entry => entry.item);

  const propertyMatches = rankProperties(properties, message, intent === 'properties' ? 5 : 2).map(compactProperty);
  const customerMatches = rank(customers, (a: Customer, b: Customer) => (b.lead_score || 0) - (a.lead_score || 0))
    .slice(0, intent === 'customers' ? 5 : 2)
    .map(compactCustomer);
  const postMatches = rank(posts, (a: Post, b: Post) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, intent === 'posts' ? 5 : 2)
    .map((post: Post) => ({
      id: post.id,
      title: post.title,
      platform: post.platform,
      status: post.status,
      property_title: post.property_title,
      content: String(post.content || '').slice(0, 500),
      created_at: post.created_at
    }));
  const inboxMatches = intent === 'inbox'
    ? rank(inbox, (a: InboxMessage, b: InboxMessage) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5)
      .map((item: InboxMessage) => ({
        id: item.id,
        sender_name: item.sender_name,
        platform: item.platform,
        intent: item.intent,
        status: item.status,
        message: String(item.message || '').slice(0, 400)
      }))
    : [];
  const contentMatches = intent === 'posts' ? rank(generatedContents).slice(0, 3).map((item: any) => ({
    id: item.id,
    channel: item.channel,
    property_title: item.property_title,
    status: item.status,
    raw_content: String(item.raw_content || '').slice(0, 500)
  })) : [];

  return {
    scope: {
      role: user.role,
      company_id: user.company_id,
      totalCustomers: customers.length,
      totalProperties: properties.length,
      totalPosts: posts.length,
      totalInbox: inbox.length,
      totalAutomations: automations.length,
      totalGeneratedContents: generatedContents.length
    },
    query: { intent, tokens, budget },
    customers: customerMatches,
    properties: propertyMatches,
    posts: postMatches,
    inbox: inboxMatches,
    automations: intent === 'automations' ? automations.slice(0, 5).map((item: AutomationTask) => ({
      id: item.id,
      name: item.name,
      status: item.status,
      trigger_event: item.trigger_event,
      run_count: item.run_count,
      last_run: item.last_run
    })) : [],
    generatedContents: contentMatches
  };
}

export function buildAssistantFallback(context: any) {
  const propertyLines = context.properties.slice(0, 5).map((property: Property) =>
    `- ${property.title}: ${property.location}, ${property.area}m2, ${property.price} tỷ, ${property.legal_status}, ${property.sale_status === 'sold' ? 'đã bán' : 'đang bán'}.`
  );
  const customerLines = context.customers.slice(0, 5).map((customer: Customer) =>
    `- ${customer.name}: ${customer.phone}, nhu cầu ${customer.property_type} tại ${customer.interested_area}, ngân sách ${customer.budget} tỷ, score ${customer.lead_score}.`
  );
  const postLines = context.posts.slice(0, 4).map((post: Post) =>
    `- [${post.platform}] ${post.title}: ${post.status}.`
  );

  return [
    'Em đã truy vấn database theo quyền hiện tại.',
    `Phạm vi dữ liệu: ${context.scope.totalCustomers} khách, ${context.scope.totalProperties} BĐS, ${context.scope.totalPosts} bài đăng, ${context.scope.totalInbox} inbox.`,
    context.query.budget ? `Ngân sách phát hiện: khoảng ${context.query.budget} tỷ.` : '',
    propertyLines.length ? `\nBĐS liên quan:\n${propertyLines.join('\n')}` : '\nChưa tìm thấy BĐS liên quan trong phạm vi quyền.',
    customerLines.length ? `\nKhách hàng liên quan:\n${customerLines.join('\n')}` : '',
    postLines.length ? `\nBài đăng liên quan:\n${postLines.join('\n')}` : '',
    '\nAI provider đang bận hoặc timeout nên em trả kết quả truy vấn DB trực tiếp trước.'
  ].filter(Boolean).join('\n');
}
