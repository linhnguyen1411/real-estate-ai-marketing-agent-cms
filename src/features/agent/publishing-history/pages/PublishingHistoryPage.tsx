import React, { useState } from 'react';
import PublishingSubnav from '../../social-publishing/shared/PublishingSubnav';
import HistoryPanel from '../../social-publishing/components/HistoryPanel';

export default function PublishingHistoryPage({ canManage }: { canManage: boolean }) {
  const [message, setMessage] = useState('');

  return (
    <div className="space-y-4">
      <PublishingSubnav
        title="Lịch sử đăng"
        subtitle="Publish log, attempts timeline, evidence & audit"
        active="history"
        message={message}
      />
      <HistoryPanel canManage={canManage} onMessage={setMessage} />
    </div>
  );
}
