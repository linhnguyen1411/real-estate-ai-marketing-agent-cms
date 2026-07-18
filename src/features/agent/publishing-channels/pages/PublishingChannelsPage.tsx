import React, { useState } from 'react';
import PublishingSubnav from '../../social-publishing/shared/PublishingSubnav';
import ChannelsPanel from '../../social-publishing/components/ChannelsPanel';

export default function PublishingChannelsPage({ canManage }: { canManage: boolean }) {
  const [message, setMessage] = useState('');

  return (
    <div className="space-y-4">
      <PublishingSubnav
        title="Kênh đăng"
        subtitle="Facebook Timeline, Group, Page — browser hoặc Graph API"
        active="channels"
        message={message}
      />
      <ChannelsPanel canManage={canManage} onMessage={setMessage} />
    </div>
  );
}
